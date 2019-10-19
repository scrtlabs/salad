const actions = require('./actions');
const {BLOCK_UPDATE,PUB_KEY_UPDATE, QUORUM_UPDATE, THRESHOLD_UPDATE, DEAL_CREATED_UPDATE, DEAL_EXECUTED_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS} = actions;
const debug = require('debug')('client');

const EventEmitter = require('events');
const Web3 = require('web3');
const forge = require('node-forge');
const EthCrypto = require('eth-crypto');

let utils;
let isNode = false;
if (typeof window === 'undefined') {
    isNode = true;
    utils = require('enigma-js/node').utils;
    WebSocket = require('ws');
} else {
    utils = require('enigma-js').utils;
}

/**
 * @typedef {Object} DepositPayload
 * @property {string} sender - The depositor Ethereum address
 * @property {string} amount - The deposit amount in wei
 * @property {string} encRecipient - The encrypted recipient Ethereum address
 * @property {string} pubKey - The user generated pubKey
 */

// TODO: Move path to config and reference Github
const SaladContract = require('../../build/smart_contracts/Salad.json');
const EnigmaContract = require('../../build/enigma_contracts/Enigma.json');

class CoinjoinClient {
    constructor(contractAddr, enigmaContractAddr, operatorUrl = 'ws://localhost:8080', provider = Web3.givenProvider) {
        // debug('new CoinjoinClient(', contractAddr, enigmaContractAddr, operatorUrl, provider, ')');
        this.web3 = new Web3(provider);
        this.ws = new WebSocket(operatorUrl);
        this.ee = new EventEmitter();
        /** @type EncryptionPubKey|null */
        this.pubKeyData = null;
        this.blockCountdown = null;
        this.keyPair = null;
        this.threshold = null;
        this.quorum = 0;
        this.contract = new this.web3.eth.Contract(SaladContract['abi'], contractAddr);
        this.enigmaContract = new this.web3.eth.Contract(EnigmaContract['abi'], enigmaContractAddr);
    }

    static obtainKeyPair() {
        const random = forge.random.createInstance();
        const privateKey = forge.util.bytesToHex(random.getBytes(32));
        const publicKey = EthCrypto.publicKeyByPrivateKey(privateKey);
        return {publicKey, privateKey};
    }

    static uint32ToBytes(web3, val) {
        return web3.utils.hexToBytes(web3.utils.padLeft(web3.utils.numberToHex(val), 16));
    }

    static uint256ToBytes(web3, val) {
        return web3.utils.hexToBytes(web3.utils.padLeft(web3.utils.numberToHex(val), 64));
    }

    static hexToBytes(web3, val) {
        if (!val.startsWith('0x')) {
            val = `0x${val}`;
        }
        return web3.utils.hexToBytes(val);
    }

    static buildDepositMessage(web3, payload) {
        const paramsInBytes = [
            web3.utils.hexToBytes(payload.sender),
            CoinjoinClient.uint256ToBytes(web3, payload.amount),
            CoinjoinClient.hexToBytes(web3, payload.encRecipient),
            CoinjoinClient.hexToBytes(web3, payload.pubKey),
        ];
        let messageBytes = [];
        for (const param of paramsInBytes) {
            const len = web3.utils.hexToBytes(web3.utils.padLeft(web3.utils.numberToHex(param.length), 8));
            messageBytes = messageBytes.concat(len);
            messageBytes = messageBytes.concat(param);
        }
        // debug('The message bytes to sign', messageBytes);
        return messageBytes;
    }

    /**
     * Generate DealId
     * @param web3
     * @param {string} amount The required deposit amount (in Wei)
     * @param {Array<string>} participants The sender addresses of Deal participants
     * @param {string} operatorAddress The operator Ethereum address
     * @param {string} operatorNonce The operator transaction count
     */
    static generateDealIdMessage(web3, amount, participants, operatorAddress, operatorNonce) {
        debug('generateDealId(', amount, participants, operatorAddress, operatorNonce, ')');
        const participantArray = [CoinjoinClient.uint32ToBytes(web3, participants.length)];
        for (const participant of participants) {
            const participantBytes = CoinjoinClient.hexToBytes(web3, web3.utils.toChecksumAddress(participant));
            participantArray.push(CoinjoinClient.uint32ToBytes(web3, participantBytes.length));
            participantArray.push(participantBytes);
        }
        const paramsInBytes = [
            CoinjoinClient.uint256ToBytes(web3, amount),
            participantArray,
            CoinjoinClient.hexToBytes(web3, web3.utils.toChecksumAddress(operatorAddress)),
            CoinjoinClient.uint256ToBytes(web3, operatorNonce),
        ];
        // debug('Building DealId from params', paramsInBytes);
        let messageBytes = [];
        for (let i = 0; i < paramsInBytes.length; i++) {
            const param = paramsInBytes[i];
            if (i === 1) {
                for (const paramVal of param) {
                    messageBytes = messageBytes.concat(paramVal);
                }
            } else {
                const len = CoinjoinClient.uint32ToBytes(web3, param.length);
                messageBytes = messageBytes.concat(len);
                messageBytes = messageBytes.concat(param);
            }
        }
        // debug('The message bytes', JSON.stringify(messageBytes));
        return messageBytes;
    }

    async _waitConnectAsync() {
        return new Promise((resolve) => {
            const callback = () => {
                debug('Connected to server');
                resolve(true);
            };
            if (isNode) {
                this.ws.on('open', callback);
                return;
            }
            this.ws.onopen = callback;
        });
    }

    /**
     * Init the client
     * 1- Wait for the WS client connection
     * 2- Fetch Ethereum accounts
     * @returns {Promise<void>}
     */
    async initAsync() {
        this.watch();
        this.keyPair = CoinjoinClient.obtainKeyPair();
        await this._waitConnectAsync();
        this.accounts = await this.web3.eth.getAccounts();
    }

    /**
     * Shutdown the WS client
     * @returns {Promise<void>}
     */
    async shutdownAsync() {
        this.ws.close();
    }

    watch() {
        const callback = (msg) => {
            msg = (msg.data) ? msg.data : msg;
            const {action, payload} = JSON.parse(msg);
            switch (action) {
                case BLOCK_UPDATE:
                    const {blockCountdown} = payload;
                    this.blockCountdown = blockCountdown;
                    break;
                case PUB_KEY_UPDATE:
                    const {pubKeyData} = payload;
                    this.pubKeyData = pubKeyData;
                    break;
                case THRESHOLD_UPDATE:
                    const {threshold} = payload;
                    this.threshold = threshold;
                    break;
                case QUORUM_UPDATE:
                    const {quorum} = payload;
                    debug('The quorum update', quorum);
                    this.quorum = quorum;
                    break;
                default:
            }
            this.ee.emit(action, payload);
        };
        if (isNode) {
            this.ws.on('message', callback);
            return;
        }
        this.ws.onmessage = callback;
    }

    /**
     * Subscribe to block countdown until the next deal
     * @param {function} callback
     */
    onBlock(callback) {
        this.ee.on(BLOCK_UPDATE, callback);
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
        if (!this.web3.utils.isAddress(sender)) {
            throw new Error(`Invalid sender ${sender}`);
        }
        if (isNaN(parseInt(amount))) {
            throw new Error(`Invalid amount ${amount}`);
        }
        debug('Posting deposit to the smart contract', amount);
        const receipt = await this.contract.methods.makeDeposit().send({...opts, from: sender, value: amount});
        // const balance = await this.contract.methods.getParticipantBalance(sender).call({from: sender});
        // debug('Got balance', balance);
        return receipt;
    }

    /**
     * Verify the public key against the registry
     * @returns {Promise<void>}
     */
    async verifyPubKeyAsync() {
        debug('Verifying pub key data against on-chain receipt', this.pubKeyData);
        const {taskId, encryptedOutput} = this.pubKeyData;
        const taskRecord = await this.enigmaContract.methods.getTaskRecord(taskId).call();
        debug('The task record', taskRecord);
        const outputHash = this.web3.utils.soliditySha3({t: 'bytes', value: encryptedOutput});
        debug('The output hash', outputHash);
        if (taskRecord.outputHash !== outputHash) {
            throw new Error(`Unable to verify encryption key, mismatching output for task: ${taskId} ${taskRecord.outputHash} !== ${outputHash}`);
        }
    }

    getPlaintextPubKey() {
        debug('Decrypting pubKey from data', this.pubKeyData);
        const derivedKey = utils.getDerivedKey(this.pubKeyData.workerPubKey, this.pubKeyData.userPrivateKey);
        const output = utils.decryptMessage(derivedKey, this.pubKeyData.encryptedOutput);
        // TODO: Why is this here?
        const prefix = '00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040';
        return output.replace(prefix, '');
    }

    /**
     * Encrypt the user recipient address in-memory. Plaintext recipient should not leave the browser.
     * @param  {string} recipient - The plaintext recipient Ethereum address
     * @returns {Promise<string>}
     */
    async encryptRecipientAsync(recipient) {
        if (!this.web3.utils.isAddress(recipient)) {
            throw new Error(`Invalid recipient address ${recipient}`);
        }
        if (!this.pubKeyData) {
            await new Promise((resolve) => {
                this.onPubKey((p) => resolve(p));
            });
        }
        await this.verifyPubKeyAsync();
        const pubKey = this.getPlaintextPubKey();
        debug('Encrypting recipient', recipient, 'with pubKey', this.pubKeyData);
        const {privateKey} = this.keyPair;
        debug('Deriving encryption from private key', privateKey);
        const derivedKey = utils.getDerivedKey(pubKey, privateKey);
        return utils.encryptMessage(derivedKey, recipient);
    }

    /**
     * Submit the deposit metadata to including the encrypted recipient address
     * @param {string} sender - The deposit sender's Ethereum address
     * @param {string} amount - The deposit amount in WEI (e.g. "10000000")
     * @param {string} encRecipient - The encrypted recipient Ethereum address
     * @param {string} pubKey - The user pubKey
     * @param {string} signature - The deposit payload signature
     * @returns {Promise<boolean>}
     */
    async submitDepositMetadataAsync(sender, amount, encRecipient, pubKey, signature) {
        if (!this.web3.utils.isAddress(sender)) {
            throw new Error(`Invalid sender address ${sender}`);
        }
        if (isNaN(parseInt(amount))) {
            throw new Error(`Invalid amount ${amount}`);
        }
        if (!this.web3.utils.isHex(encRecipient)) {
            throw new Error(`Invalid encrypted recipient ${encRecipient}`);
        }
        if (!this.web3.utils.isHex(pubKey)) {
            throw new Error(`Invalid pub key ${pubKey}`);
        }
        if (!this.web3.utils.isHex(signature)) {
            throw new Error(`Invalid signature ${signature}`);
        }
        debug('Submitting deposit metadata to the operator', amount, encRecipient);
        const promise = new Promise((resolve) => {
            this.ee.once(SUBMIT_DEPOSIT_METADATA_SUCCESS, (result) => resolve(result));
        });
        this.ws.send(JSON.stringify({
            action: SUBMIT_DEPOSIT_METADATA,
            payload: {sender, amount, encRecipient, pubKey, signature}
        }));
        return promise;
    }

    /**
     * Fetch all fillable deposits for the given minimum amount
     * @param {number} [minAmount=0] - The optional minimum amount filter
     * @returns {Promise<Object>}
     */
    async fetchFillableDepositsAsync(minAmount = 0) {
        if (isNaN(minAmount)) {
            throw new Error(`Invalid amount ${minAmount}`);
        }
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
    async findDealsAsync(statusFilter) {
        const dealsFlat = await this.contract.methods.listDeals(statusFilter).call();
        const deals = [];
        if (!dealsFlat) {
            return deals;
        }
        for (let i = 0; i < dealsFlat[0].length; i++) {
            const status = parseInt(dealsFlat[4][i]);
            if (status === statusFilter) {
                deals.push({
                    dealId: dealsFlat[0][i],
                    organizer: dealsFlat[1][i],
                    depositInWei: parseInt(dealsFlat[2][i]),
                    numParticipant: parseInt(dealsFlat[3][i]),
                    status,
                });
            }
        }
        debug('The active deals', deals);
        return deals;
    }

    /**
     * Sign the deposit metadata
     * @param {string} sender
     * @param {string} amount - The deposit amount in WEI (e.g. "10000000")
     * @param {string} encRecipient - The encrypted recipient Ethereum address
     * @param {string} pubKey - The user pubKey
     * @returns {Promise<void>}
     */
    async signDepositMetadataAsync(sender, amount, encRecipient, pubKey) {
        if (!this.web3.utils.isAddress(sender)) {
            throw new Error(`Invalid sender address ${sender}`);
        }
        if (isNaN(parseInt(amount))) {
            throw new Error(`Invalid amount ${amount}`);
        }
        if (!this.web3.utils.isHex(encRecipient)) {
            throw new Error(`Invalid encrypted recipient ${encRecipient}`);
        }
        if (!this.web3.utils.isHex(pubKey)) {
            throw new Error(`Invalid pub key ${pubKey}`);
        }
        /** @type DepositPayload */
        const payload = {sender, amount, encRecipient, pubKey};
        const messageBytes = CoinjoinClient.buildDepositMessage(this.web3, payload);
        // debug('The message', messageBytes);
        // debug('The message length', messageBytes.length);
        const message = this.web3.utils.bytesToHex(messageBytes);
        // debug('Signing message', message);
        const hash = this.web3.utils.soliditySha3({t: 'bytes', v: message});
        const sigHex = await this.web3.eth.sign(hash, sender);
        const sigBytes = this.web3.utils.hexToBytes(sigHex);
        // See notes about the last byte of the signature here: https://github.com/ethereum/wiki/wiki/JavaScript-API
        sigBytes[sigBytes.length - 1] = sigBytes[sigBytes.length - 1] + 27;
        return this.web3.utils.bytesToHex(sigBytes);
    }
}

module.exports = {CoinjoinClient, actions};
