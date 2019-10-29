// TODO: Move path to config and reference Github
const SaladContract = require('../../build/smart_contracts/Salad.json');
const {CoinjoinClient} = require('@salad/client');
const debug = require('debug')('operator:deal-manager');

const DEAL_STATUS = {
    NEW: 0,
    EXECUTABLE: 1,
    EXECUTED: 2,
};

/**
 * @typedef {Object} Deal
 * @property {string} dealId - The Deal Identifier
 * @property {string} depositAmount - The deposit amount in wei
 * @property {string[]} participants - A list of participants Ethereum addresses
 * @property {string} nonce - The deal nonce (operator tx count)
 * @property {number} status - A list of participants Ethereum addresses
 * @property {string|null} _tx - The `createDeal` Ethereum transaction hash
 * @property {string|null} taskId - The Enigma Task Id
 */

/**
 * @typedef {Object} Deposit
 * @property {string} sender - The depositor Ethereum address
 * @property {string} amount - The deposit amount in wei
 * @property {string} encRecipient - The encrypted recipient Ethereum address
 * @property {string} pubKey - The user generated pubKey
 * @property {string} signature - The deposit payload signature
 */

/**
 * @typedef {Object} EncryptionPubKey
 * @property {string} encryptedOutput - The encrypted output string
 * @property {string} userPrivateKey - The private key that decrypts the output
 * @property {string} workerPubKey - The the worker public key to decrypt the output
 * @property {string} taskId - The TaskId of the task that fetched the public key
 */
/**
 * Coordinate deal execution
 */
class DealManager {
    constructor(web3, scClient, contractAddr, store, threshold, gasValues = {
        createDeal: 4712388,
        fetchPubKey: 4712388,
    }) {
        this.web3 = web3;
        this.scClient = scClient;
        this.store = store;
        this.threshold = threshold;
        this.contract = new this.web3.eth.Contract(SaladContract['abi'], contractAddr);
        this.gasValues = gasValues;
    }

    /**
     * Verify that the specified deposit amount is locked on Ethereum
     * @param {string} sender - The depositor's Ethereum address
     * @param {string} amount - The deposit amount in wei
     * @returns {Promise<boolean>}
     */
    async verifyDepositAmountAsync(sender, amount) {
        debug('Verifying balance for deposit', sender, amount);
        const account = this.web3.utils.toChecksumAddress(sender);
        const balance = await this.contract.methods.getParticipantBalance(account).call({from: this.scClient.getOperatorAccount()});
        debug('Comparing balance with amount', balance, amount);
        const senderBalance = this.web3.utils.toBN(balance);
        const depositAmount = this.web3.utils.toBN(amount);
        if (senderBalance.lt(depositAmount)) {
            throw new Error(`Sender ${sender} balance (in wei) less than deposit: ${senderBalance} < ${depositAmount}`)
        }
    }

    /**
     * Verify and store the specified deposit
     * @param {string} sender - The depositor's Ethereum address
     * @param {string} amount - The deposit amount in wei
     * @param {string} pubKey - The user pubKey
     * @param {string} encRecipient - The recipient's encrypted Ethereum address
     * @param {string} signature - The deposit payload signature
     * @returns {Promise<Deposit>}
     */
    async registerDepositAsync(sender, amount, pubKey, encRecipient, signature) {
        debug('Registering deposit', sender, amount, encRecipient);
        await this.verifyDepositAmountAsync(sender, amount);
        const deposit = {sender, amount, pubKey, encRecipient, signature};
        await this.store.insertDepositAsync(deposit);
        return deposit;
    }

    /**
     * Create deal on Ethereum if quorum reached or exit
     * @param {Object} opts - Ethereum transaction options
     * @param {string} amount - The minimum deposit amount in wei
     * @returns {Promise<Deal|null>}
     */
    async createDealIfQuorumReachedAsync(opts, amount = 0) {
        const deposits = await this.fetchFillableDepositsAsync(amount);
        debug('Evaluating quorum', deposits.length, 'against threshold', this.threshold);
        /** @type Deal | null */
        let deal = null;
        if (deposits.length >= this.threshold) {
            debug('Quorum reached with deposits', deposits);
            deal = await this.createDealAsync(deposits, opts);
        }
        return deal;
    }

    /**
     * Fetch the fillable deposits as tracked by the operator
     * @param minimumAmount
     * @returns {Promise<Array<Deposit>>}
     */
    async fetchFillableDepositsAsync(minimumAmount = 0) {
        const deposits = await this.store.queryFillableDepositsAsync(minimumAmount);
        debug('The fillable deposits', deposits);
        return deposits;
    }

    /**
     * Create new Deal on Ethereum
     * @param {Array<Deposit>} deposits - The Deposits linked to the Deal
     * @param {Object} opts - Ethereum tx options
     * @returns {Promise<Deal>}
     */
    async createDealAsync(deposits, opts) {
        const pendingDeals = await this.store.queryDealsAsync(DEAL_STATUS.EXECUTABLE);
        if (pendingDeals.length > 0) {
            debug('The executable deals', pendingDeals);
            throw new Error('Cannot creating a new deal until current deal is executed');
        }
        debug('Creating deal with deposits', deposits);
        // TODO: Assuming that all deposits are equal for now
        /** @type string */
        const depositAmount = deposits[0].amount;
        /** @type string[] */
        const participants = deposits.map((deposit) => deposit.sender);
        const sender = this.scClient.getOperatorAccount();
        const nonce = (await this.web3.eth.getTransactionCount(sender)).toString();
        debug('The nonce', nonce);
        const dealIdMessage = CoinjoinClient.generateDealIdMessage(this.web3, depositAmount, participants, sender, nonce);
        const dealId = this.web3.utils.soliditySha3({
            t: 'bytes',
            v: this.web3.utils.bytesToHex(dealIdMessage),
        });
        // debug('The dealId', dealId);
        const deal = {dealId, depositAmount, participants, nonce, _tx: null, status: DEAL_STATUS.NEW};
        await this.store.insertDealAsync(deal);
        const receipt = await this.contract.methods.newDeal(depositAmount, participants, nonce).send({
            ...opts,
            gas: this.gasValues.createDeal,
            from: sender,
        });
        const receiptDealId = receipt.events.NewDeal.returnValues._dealId;
        if (receiptDealId !== dealId) {
            throw new Error(`DealId in receipt does not match generated value ${receiptDealId} !== ${dealId}`);
        }
        deal._tx = receipt.transactionHash;
        deal.status = DEAL_STATUS.EXECUTABLE;
        await this.store.updateDealAsync(deal);
        return deal;
    }

    /**
     * Execute tracked Deal
     *   1- Send an Enigma tx with the `dealId` and `encRecipients`
     *   2- Enigma decrypts and shuffles the recipient Ethereum addresses
     *   3- Enigma calls the `executeDeal` method of the Ethereum contract
     *   4- Ethereum contract verifies the Enigma signature and distribute the deposits
     * @param {Deal} deal - The executable deal
     * @param {Object} taskRecordOpts
     * @returns {Promise<void>}
     */
    async executeDealAsync(deal, taskRecordOpts) {
        const {depositAmount, nonce} = deal;
        const deposits = await this.store.getDepositAsync(deal.dealId);
        const nbRecipient = deposits.length;
        const pubKeys = [];
        const encRecipients = [];
        const senders = [];
        const signatures = [];
        for (const deposit of deposits) {
            try {
                // Discard the deposit if the balance is withdrawn
                await this.verifyDepositAmountAsync(deposit.sender, deposit.amount);
                pubKeys.push(`0x${deposit.pubKey}`);
                encRecipients.push(`0x${deposit.encRecipient}`);
                senders.push(deposit.sender);
                signatures.push(deposit.signature);
            } catch (e) {
                debug('Discarding invalid deposit', e);
                // TODO: Add to unit tests
                await this.store.discardDepositAsync(deposit);
            }
        }
        const task = await this.scClient.executeDealAsync(nbRecipient, depositAmount, pubKeys, encRecipients, senders, signatures, nonce, taskRecordOpts);
        deal.taskId = task.taskId;
        deal.status = DEAL_STATUS.EXECUTED;
        await this.store.updateDealAsync(deal);
        deal._tx = task.transactionHash;
    }

    async getBlocksUntilDealAsync() {
        const blockNumber = await this.web3.eth.getBlockNumber();
        debug('The block', blockNumber);
        const lastExecutionBlockNumber = await this.contract.methods.lastExecutionBlockNumber().call();
        const dealIntervalInBlocks = await this.contract.methods.dealIntervalInBlocks().call();
        const countdown = (parseInt(lastExecutionBlockNumber) + parseInt(dealIntervalInBlocks)) - parseInt(blockNumber);
        debug(lastExecutionBlockNumber, '+', dealIntervalInBlocks, '-', blockNumber, '=', countdown);
        return countdown;
    }
}

module.exports = {DealManager, DEAL_STATUS};