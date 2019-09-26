// TODO: Move path to config and reference Github
const EnigmaCoinjoinContract = require('../../build/smart_contracts/Mixer.json');
const {utils} = require('enigma-js/node');
const {CoinjoinClient} = require('enigma-coinjoin-client');

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
 * @property {number} status - A list of participants Ethereum addresses
 * @property {string|null} _tx - The `createDeal` Ethereum transaction hash
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
        this.contract = new this.web3.eth.Contract(EnigmaCoinjoinContract['abi'], contractAddr);
        this.gasValues = gasValues;
    }

    /**
     * Verify that the specified deposit amount is locked on Ethereum
     * @param {string} sender - The depositor's Ethereum address
     * @param {string} amount - The deposit amount in wei
     * @returns {Promise<boolean>}
     */
    async verifyDepositAmountAsync(sender, amount) {
        console.log('Verifying balance for deposit', sender, amount);
        const account = this.web3.utils.toChecksumAddress(sender);
        const balance = await this.contract.methods.getParticipantBalance(account).call({from: this.scClient.getOperatorAccount()});
        console.log('Comparing balance with amount', balance, amount);
        return (this.web3.utils.toBN(balance) >= this.web3.utils.toBN(amount));
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
        console.log('Registering deposit', sender, amount, encRecipient);
        await this.verifyDepositAmountAsync(sender, amount);
        const deposit = {sender, amount, pubKey, encRecipient, signature};
        this.store.insertDeposit(deposit);
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
        console.log('Evaluating quorum', deposits.length, 'against threshold', this.threshold);
        /** @type Deal | null */
        let deal = null;
        if (deposits.length >= this.threshold) {
            console.log('Quorum reached with deposits', deposits);
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
        return new Promise((resolve) => {
            resolve(this.store.queryFillableDeposits(minimumAmount));
        });
    }

    /**
     * Create new Deal on Ethereum
     * @param {Array<Deposit>} deposits - The Deposits linked to the Deal
     * @param {Object} opts - Ethereum tx options
     * @returns {Promise<Deal>}
     */
    async createDealAsync(deposits, opts) {
        /** @type string */
        console.log('Creating deal with deposits', deposits);
        // TODO: Assuming that all deposits are equal for now
        /** @type string */
        const depositAmount = deposits[0].amount;
        /** @type string[] */
        const participants = deposits.map((deposit) => deposit.sender);
        const sender = this.scClient.getOperatorAccount();
        const nonce = await this.web3.eth.getTransactionCount(sender);
        const dealId = CoinjoinClient.generateDealId(this.web3, depositAmount, participants, sender, nonce);
        console.log('The dealId', dealId);
        const deal = {dealId, depositAmount, participants, _tx: null, status: DEAL_STATUS.NEW};
        this.store.insertDeal(deal);
        const receipt = await this.contract.methods.newDeal(depositAmount, participants, nonce).send({
            ...opts,
            gas: this.gasValues.createDeal,
            from: sender,
        });
        console.log('Got deal data from receipt', receipt.events.NewDeal.returnValues);
        const receiptDealId = receipt.events.NewDeal.returnValues._dealId;
        if (receiptDealId !== dealId) {
            // TODO: Throw error
            // throw new Error(`DealId in receipt does not match generated value ${receiptDealId} !== ${dealId}`);
        }
        deal._tx = receipt.transactionHash;
        deal.status = DEAL_STATUS.EXECUTABLE;
        this.store.setDealExecutable(deal);
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
        const {participants, depositAmount} = deal;
        const deposits = participants.map(p => this.store.getDeposit(p));
        console.log('The deposits', deposits);
        const encRecipientsBytes = deposits.map(d => this.web3.utils.hexToBytes(`0x${d.encRecipient}`));
        console.log('The encrypted participants', encRecipientsBytes);
        console.log('The encrypted participants count', encRecipientsBytes.map(d => d.length));
        const nbRecipient = deposits.length;
        const pubKeysPayload = `0x${deposits.map(d => d.pubKey).join('')}`;
        const encRecipientsPayload = `0x${deposits.map(d => d.encRecipient).join('')}`;
        const sendersPayload = `0x${deposits.map(d => utils.remove0x(d.sender)).join('')}`;
        const signaturesPayload = `0x${deposits.map(d => utils.remove0x(d.signature)).join('')}`;
        console.log('The merged encrypted recipients', this.web3.utils.hexToBytes(encRecipientsPayload));
        for (const deposit of deposits) {
            const sigBytes = this.web3.utils.hexToBytes(deposit.signature);
            if (sigBytes.length !== 65) {
                console.error('The signature length', sigBytes.length, sigBytes);
            }
        }
        const task = await this.scClient.executeDealAsync(nbRecipient, depositAmount, pubKeysPayload, encRecipientsPayload, sendersPayload, signaturesPayload, taskRecordOpts);
        deal._tx = task.transactionHash;
        deal.status = DEAL_STATUS.EXECUTED;
    }
}

module.exports = {DealManager, DEAL_STATUS};