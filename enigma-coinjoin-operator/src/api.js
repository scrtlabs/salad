const {SecretContractClient} = require("./secretContractClient");
const {Store} = require("./store");
const {PUB_KEY_UPDATE, DEAL_CREATED_UPDATE, DEAL_EXECUTED_UPDATE, QUORUM_UPDATE, BLOCK_UPDATE, THRESHOLD_UPDATE, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_SUCCESS} = require("enigma-coinjoin-client").actions;
const Web3 = require('web3');
const {DealManager} = require("./dealManager");
const {utils} = require('enigma-js/node');
const EventEmitter = require('events');
const {CoinjoinClient} = require('enigma-coinjoin-client');
const debug = require('debug')('operator');

/**
 * @typedef {Object} OperatorAction
 * @property {string} action - The action identified
 * @property {Object} payload - The serialized action payload
 */

// TODO: Consider moving to config
const GET_ENCRYPTION_PUB_KEY_GAS_PRICE = 0.001;
const GET_ENCRYPTION_PUB_KEY_GAS_LIMIT = 4712388;
const EXECUTE_DEAL_GAS_PRICE = 0.001;
const EXECUTE_DEAL_GAS_LIMIT = 87123880;

class OperatorApi {
    constructor(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex = 0, pauseOnRetryInSeconds = 10) {
        this.store = new Store();
        this.web3 = new Web3(provider);
        this.sc = new SecretContractClient(this.web3, scAddr, enigmaUrl, accountIndex);
        this.defaultTaskRecordOpts = {taskGasLimit: 4712388, taskGasPx: 100000000000};
        this.dealManager = new DealManager(this.web3, this.sc, contractAddr, this.store, threshold);
        this.ee = new EventEmitter();
        this.threshold = threshold;
        this.pauseOnRetryInSeconds = pauseOnRetryInSeconds;
        this.active = false;

        // TODO: Default Ethereum options, add to config
        this.txOpts = {
            gas: 100712388,
            gasPrice: process.env.GAS_PRICE,
        };
    }

    /**
     * Initialize the stateful components
     * @returns {Promise<void>}
     */
    async initAsync() {
        await this.store.initAsync();
        await this.sc.initAsync(this.defaultTaskRecordOpts);
        this.active = true;

        process.on('SIGINT', async () => {
            await this.shutdownAsync();
            process.exit();
        });
    }

    async watchBlocksUntilDeal() {
        while (this.active === true) {
            const countdown = await this.refreshBlocksUntilDeal();
            if (countdown === 0) {
                await this.handleDealProcessingAsync();
            }
            await utils.sleep(10000);
        }
    }

    async refreshBlocksUntilDeal() {
        const blockCountdown = await this.dealManager.getBlocksUntilDealAsync();
        this.ee.emit(BLOCK_UPDATE, blockCountdown);
        return blockCountdown;
    }

    async shutdownAsync() {
        this.active = false;
        try {
            await this.store.closeAsync();
        } catch (e) {
            console.error('Unable to close the db connection', e);
        }
    }

    /**
     * Call broadcast fn on pub key
     * @param broadcastCallback
     */
    onPubKey(broadcastCallback) {
        this.ee.on(PUB_KEY_UPDATE, (pubKeyData) => {
            broadcastCallback({action: PUB_KEY_UPDATE, payload: {pubKeyData}})
        });
    }

    /**
     * Call broadcast fn on Deal creation
     * @param broadcastCallback
     */
    onDealCreated(broadcastCallback) {
        this.ee.on(DEAL_CREATED_UPDATE, (deal) => {
            broadcastCallback({action: DEAL_CREATED_UPDATE, payload: {deal}})
        });
    }

    /**
     * Call broadcast fn on Deal execution
     * @param broadcastCallback
     */
    onDealExecuted(broadcastCallback) {
        this.ee.on(DEAL_EXECUTED_UPDATE, (deal) => broadcastCallback({action: DEAL_EXECUTED_UPDATE, payload: {deal}}));
    }

    /**
     * Call broadcast fn on Quorum update
     * @param broadcastCallback
     */
    onQuorumUpdate(broadcastCallback) {
        this.ee.on(QUORUM_UPDATE, (quorum) => broadcastCallback({action: QUORUM_UPDATE, payload: {quorum}}));
    }

    onBlock(broadcastCallback) {
        this.ee.on(BLOCK_UPDATE, (blockCountdown) => broadcastCallback({
            action: BLOCK_UPDATE,
            payload: {blockCountdown}
        }));
    }

    /**
     * Return the threshold value
     * @returns {OperatorAction}
     */
    getThreshold() {
        const threshold = this.threshold;
        return {action: THRESHOLD_UPDATE, payload: {threshold}};
    }

    /**
     * Post-processing after each deposit.
     * Creates a deal if the quorum is reached.
     * @returns {Promise<void>}
     */
    async handleDealProcessingAsync() {
        debug('Evaluating deal creation in non-blocking scope');
        const deal = await this.dealManager.createDealIfQuorumReachedAsync(this.txOpts);
        if (deal) {
            debug('Broadcasting new deal');
            this.ee.emit(DEAL_CREATED_UPDATE, deal);

            debug('Broadcasting quorum value 0 after new deal');
            const fillableDeposits = await this.dealManager.fetchFillableDepositsAsync();
            debug('Fillable deposits after deal', fillableDeposits);
            const quorum = fillableDeposits.length;
            if (quorum !== 0) {
                throw new Error('Data corruption, the quorum should be 0 after creating a deal');
            }
            this.ee.emit(QUORUM_UPDATE, quorum);

            debug('Deal created on Ethereum, executing...', deal._tx);
            const taskRecordOpts = {
                taskGasLimit: EXECUTE_DEAL_GAS_LIMIT,
                taskGasPx: utils.toGrains(EXECUTE_DEAL_GAS_PRICE),
            };
            await this.dealManager.executeDealAsync(deal, taskRecordOpts);
            debug('Deal executed on Ethereum', deal._tx);
            this.ee.emit(DEAL_EXECUTED_UPDATE, deal);
        }
    }

    /**
     * Fetch the encryption public key and store it in cache
     * @returns {Promise<OperatorAction>}
     */
    async loadEncryptionPubKeyAsync() {
        debug('Sending encryption public key to new connected client');
        const taskRecordOpts = {
            taskGasLimit: GET_ENCRYPTION_PUB_KEY_GAS_LIMIT,
            taskGasPx: utils.toGrains(GET_ENCRYPTION_PUB_KEY_GAS_PRICE),
        };
        /** @type EncryptionPubKey|null */
        let pubKeyData = await this.store.fetchPubKeyData();
        debug('Pub key data from cache', pubKeyData);
        while (pubKeyData === null) {
            try {
                await utils.sleep(300);
                debug('This is the first start, fetching the encryption key from Enigma');
                pubKeyData = await this.sc.getPubKeyDataAsync(taskRecordOpts);
                if (pubKeyData !== null) {
                    await this.store.insertPubKeyDataInCache(pubKeyData);
                }
            } catch (e) {
                console.error('Unable to fetch public encryption key', e);
                // TODO: Consider cancelling and creating new task when the epoch changes
                await utils.sleep(this.pauseOnRetryInSeconds * 1000);
            }
        }
        this.ee.emit(PUB_KEY_UPDATE, pubKeyData);
    }

    /**
     * Verify the deposit signature
     * @param {DepositPayload} payload
     * @param {string} signature
     * @returns {*}
     * @private
     */
    _verifyDepositSignature(payload, signature) {
        const messageBytes = CoinjoinClient.buildDepositMessage(this.web3, payload);
        const message = this.web3.utils.bytesToHex(messageBytes);
        debug('Verifying message', message, 'with signature', signature);
        const hash = this.web3.utils.soliditySha3({t: 'bytes', v: message});
        const sender = this.web3.eth.accounts.recover(hash, signature);
        debug('Recovered sender', sender);
        return (sender === payload.sender);
    }

    /**
     * Coordinate the submission of a new deposit
     * @param sender
     * @param amount
     * @param pubKey
     * @param encRecipient
     * @param signature
     * @returns {Promise<OperatorAction>}
     */
    async submitDepositMetadataAsync(sender, amount, pubKey, encRecipient, signature) {
        debug('Got deposit metadata with signature', signature);
        const payload = {sender, amount, encRecipient, pubKey};
        if (!this._verifyDepositSignature(payload, signature)) {
            throw new Error(`Signature verification failed: ${signature}`);
        }
        const registeredDeposit = await this.dealManager.registerDepositAsync(sender, amount, pubKey, encRecipient, signature);
        debug('Registered deposit', registeredDeposit);

        const fillableDeposits = await this.dealManager.fetchFillableDepositsAsync();
        const quorum = fillableDeposits.length;

        debug('Broadcasting quorum update', quorum);
        this.ee.emit(QUORUM_UPDATE, quorum);

        // TODO: Is this readable enough?
        // Non-blocking, do not wait for the outcome of port-processing
        // (async () => {
        //         let dealExecuted = false;
        //         do {
        //             try {
        //                 await utils.sleep(300);
        //                 await this.handleDealProcessingAsync();
        //                 dealExecuted = true;
        //             } catch (e) {
        //                 // TODO: Log somewhere
        //                 console.error('Unable to create deal', e);
        //                 await utils.sleep(this.pauseOnRetryInSeconds * 1000);
        //             }
        //         } while (!dealExecuted);
        //     }
        // )();
        return {action: SUBMIT_DEPOSIT_METADATA_SUCCESS, payload: true};
    }

    /**
     * Return a list of fillable deposits
     * @returns {Promise<OperatorAction>}
     */
    async fetchFillableDepositsAsync(minimumAmount) {
        const deposits = await this.dealManager.fetchFillableDepositsAsync(minimumAmount);
        return {action: FETCH_FILLABLE_SUCCESS, payload: {deposits}};
    }

    /**
     * Return the current Quorum value
     * @returns {Promise<OperatorAction>}
     */
    async fetchQuorumAsync(minimumAmount) {
        // Sending current quorum on connection
        const fillableDeposits = await this.dealManager.fetchFillableDepositsAsync(minimumAmount);
        const quorum = fillableDeposits.length;
        return {action: QUORUM_UPDATE, payload: {quorum}};
    }
}

module.exports = {OperatorApi};