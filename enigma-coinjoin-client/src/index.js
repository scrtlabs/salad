const actions = require('./actions');
const {PUB_KEY_UPDATE, QUORUM_UPDATE, THRESHOLD_UPDATE, DEAL_CREATED_UPDATE, DEAL_EXECUTED_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS} = actions;

const EventEmitter = require('events');
const Web3 = require('web3');
const {utils} = require('enigma-js/node'); // TODO: Replace by browser version before bundling
const WebSocket = require('ws');

// TODO: Move path to config and reference Github
const EnigmaCoinjoinContract = require('../../build/smart_contracts/Mixer.json');

class CoinjoinClient {
    constructor(contractAddr, operatorUrl = 'http://localhost:3346', provider = Web3.givenProvider) {
        this.web3 = new Web3(provider);
        this.ws = new WebSocket(operatorUrl);
        this.ee = new EventEmitter();
        this.pubKey = null;
        this.threshold = null;
        this.quorum = 0;
        this.contract = new this.web3.eth.Contract(EnigmaCoinjoinContract['abi'], contractAddr);
    }

    async _waitConnectAsync() {
        return new Promise((resolve) => {
            this.ws.on('open', function open() {
                console.log('Connected to server');
                resolve(true);
            });
        });
    }

    /**
     * Init the client
     * 1- Wait for the WS client connection
     * 2- Fetch Ethereum accounts
     * @returns {Promise<void>}
     */
    async initAsync() {
        await this._waitConnectAsync();
        this.accounts = await this.web3.eth.getAccounts();
        this.watch();
    }

    /**
     * Shutdown the WS client
     * @returns {Promise<void>}
     */
    async shutdownAsync() {
        this.ws.close();
    }

    watch() {
        this.ws.on('message', (msg) => {
            console.log('Got message', msg);
            const {action, payload} = JSON.parse(msg);
            switch (action) {
                case PUB_KEY_UPDATE:
                    const {pubKey} = payload;
                    this.pubKey = pubKey;
                    break;
                case THRESHOLD_UPDATE:
                    const {threshold} = payload;
                    this.threshold = threshold;
                    break;
                case QUORUM_UPDATE:
                    const {quorum} = payload;
                    console.log('The quorum update', quorum);
                    this.quorum = quorum;
                    break;
                default:
            }
            this.ee.emit(action, payload);
        });
    }

    /**
     * Subscribe to the `pubKeyUpdate` event
     * @param {function} callback
     */
    onPubKey(callback) {
        this.ee.on(PUB_KEY_UPDATE, callback);
    }

    /**
     * Subscribe to the `thresholdUpdate` event
     * The threshold is the minimum number of participants required to create a Deal
     * @param {function} callback
     */
    onThresholdValue(callback) {
        this.ee.on(THRESHOLD_UPDATE, callback);
    }

    /**
     * Subscribe to the `quorumUpdate` event
     * The quorum is the minimum number of participants who posted the deposit queued for the next Deal
     * @param {function} callback
     */
    onQuorumValue(callback) {
        this.ee.on(QUORUM_UPDATE, callback);
    }

    /**
     * Subscribe to the `dealCreatedUpdate` event
     * Broadcasts all deals created by the operator (regardless of the participation any specific user)
     * @param {function} callback
     */
    onDealCreated(callback) {
        this.ee.on(DEAL_CREATED_UPDATE, callback);
    }

    /**
     * Subscribe to the `dealExecutedUpdate` event
     * Broadcasts all deals executed by the operator (regardless of the participation any specific user)
     * @param {function} callback
     */
    onDealExecuted(callback) {
        this.ee.on(DEAL_EXECUTED_UPDATE, callback);
    }

    /**
     * Make user deposit on Ethereum
     * @param {string} sender - The deposit sender's Ethereum address
     * @param {string} amount - The deposit amount in WEI (e.g. "10000000")
     * @param {Object} [opts] - The optional Web3 send options, sender will be overwritten
     * @returns {Promise<Receipt>}
     */
    async makeDepositAsync(sender, amount, opts) {
        console.log('Posting deposit to the smart contract', amount);
        const amountInWei = this.web3.utils.toWei(amount, 'ether');

        const receipt = await this.contract.methods.makeDeposit().send({...opts, from: sender, value: amountInWei});
        // const balance = await this.contract.methods.getParticipantBalance(sender).call({from: sender});
        // console.log('Got balance', balance);
        return receipt;
    }

    /**
     * Encrypt the user recipient address in-memory. Plaintext recipient should not leave the browser.
     * @param  {string} recipient - The plaintext recipient Ethereum address
     * @returns {Promise<string>}
     */
    async encryptRecipient(recipient) {
        if (!this.pubKey) {
            throw new Error('Public encryption key not available');
        }
        return utils.encryptMessage(this.pubKey, recipient);
    }

    /**
     * Submit the deposit metadata to including the encrypted recipient address
     * @param {string} sender - The deposit sender's Ethereum address
     * @param {string} amount - The deposit amount in WEI (e.g. "10000000")
     * @param {string} encRecipient - The encrypted recipient Ethereum address
     * @returns {Promise<boolean>}
     */
    async submitDepositMetadataAsync(sender, amount, encRecipient) {
        console.log('Submitting deposit metadata to the operator', amount, encRecipient);
        const promise = new Promise((resolve) => {
            this.ee.once(SUBMIT_DEPOSIT_METADATA_SUCCESS, (result) => resolve(result));
        });
        this.ws.send(JSON.stringify({action: SUBMIT_DEPOSIT_METADATA, payload: {sender, amount, encRecipient}}));
        return promise;
    }

    /**
     * Fetch all fillable deposits for the given minimum amount
     * @param {number} [minAmount=0] - The optional minimum amount filter
     * @returns {Promise<Object>}
     */
    async fetchFillableDepositsAsync(minAmount = 0) {
        const promise = new Promise((resolve) => {
            this.ee.once(FETCH_FILLABLE_SUCCESS, (result) => resolve(result));
        });
        this.ws.send(JSON.stringify({action: FETCH_FILLABLE_DEPOSITS, payload: {minAmount}}));
        return promise;
    }

    /**
     * Fetch all active (registered on-chain but not executed) deals
     * @returns {Promise<Array<Object>>}
     */
    async fetchActiveDealsAsync() {
        const dealsFlat = await this.contract.methods.listDeals().call();
        // TODO: Does this work?
        if (!dealsFlat) {
            return [];
        }
        const deals = [];
        for (let i = 0; i < dealsFlat[0].length; i++) {
            deals.push({status: dealsFlat[0][i], participates: dealsFlat[1][i], organizes: dealsFlat[2][i]});
        }
        console.log('The active deals', deals);
    }
}

module.exports = {CoinjoinClient, actions};