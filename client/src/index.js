const actions = require('./actions');
const {BLOCK_UPDATE, PUB_KEY_UPDATE, QUORUM_UPDATE, THRESHOLD_UPDATE, DEAL_CREATED_UPDATE, DEAL_EXECUTED_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_RESULT, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS, QUORUM_NOT_REACHED_UPDATE, FETCH_CONFIG, FETCH_CONFIG_SUCCESS} = actions;
const debug = require('debug')('client');
debug.enabled = true;

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
        // TODO: Remove when sig issue is resolved
        this.patchedWeb3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
        this.web3 = new Web3(provider);
        this.ws = new WebSocket(operatorUrl);
        this.isConnected = new Promise((resolve) => {
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
        this.ee = new EventEmitter();
        /** @type EncryptionPubKey|null */
        this.pubKeyData = null;
        this.blockCountdown = null;
        this.keyPair = null;
        this.threshold = null;
        this.quorum = 0;
        // TODO: Should fetch addresses from server on init
        this.contract = new this.web3.eth.Contract(SaladContract['abi'], contractAddr);
        this.enigmaContract = new this.web3.eth.Contract(EnigmaContract['abi'], enigmaContractAddr);
        this.config = null;
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

    async fetchConfigAsync() {
        const promise = new Promise((resolve) => {
            this.ee.once(FETCH_CONFIG_SUCCESS, (result) => resolve(result.config));
        });
        this.ws.send(JSON.stringify({
            action: FETCH_CONFIG,
            payload: {}
        }));
        return promise;
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
        await this.isConnected;
        this.accounts = await this.web3.eth.getAccounts();
        const config = await this.fetchConfigAsync();
        const {saladAddr, enigmaAddr, pubKeyData} = config;
        this.pubKeyData = pubKeyData;
        // TODO: Remove from the constructor
        // this.contract = new this.web3.eth.Contract(SaladContract['abi'], saladAddr);
        // this.enigmaContract = new this.web3.eth.Contract(EnigmaContract['abi'], enigmaAddr);
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
     * Subscribe to the `quorumNotReached` event
     * @param {function} callback
     */
    onQuorumNotReached(callback) {
        this.ee.on(QUORUM_NOT_REACHED_UPDATE, callback);
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

    /**
     * Get the plaintext encryption pub key from the encrypted pub key data
     * @returns {string}
     */
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
            throw new Error("Attribute pubKeyData not set. Please call initAsync");
        }
        await this.verifyPubKeyAsync();
        const pubKey = this.getPlaintextPubKey();
        debug('Encrypting recipient', recipient, 'with pubKey', this.pubKeyData);
        const {privateKey} = this.keyPair;
        debug('Deriving encryption from private key', privateKey);
        const derivedKey = utils.getDerivedKey(pubKey, privateKey);
        const recipientBytes = new Uint8Array(this.web3.utils.hexToBytes(recipient));
        // const recipientBytes = recipient;
        return utils.encryptMessage(derivedKey, recipientBytes);
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
        const promise = new Promise((resolve, reject) => {
            this.ee.once(SUBMIT_DEPOSIT_METADATA_RESULT, (result) => {
                if (result.err) {
                    reject(new Error(result.err));
                }
                resolve(result)
            });
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
            deals.push({
                dealId: dealsFlat[0][i],
                organizer: dealsFlat[1][i],
                depositInWei: parseInt(dealsFlat[2][i]),
                numParticipant: parseInt(dealsFlat[3][i]),
            });
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
     * @returns {Promise<string>}
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
        const message = this.web3.utils.bytesToHex(messageBytes);
        const hash = this.web3.utils.soliditySha3({t: 'bytes', v: message});
        let sigHex;
        if (this.web3.currentProvider.isMetaMask === true) {
            // TODO: The metamask signature does not match, find out why
            // contract_1  | Available Accounts
            // contract_1  | ==================
            // contract_1  | (0) 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1 (100 ETH)
            // contract_1  | (1) 0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0 (100 ETH)
            // contract_1  | (2) 0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b (100 ETH)
            // contract_1  | (3) 0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d (100 ETH)
            // contract_1  | (4) 0xd03ea8624C8C5987235048901fB614fDcA89b117 (100 ETH)
            // contract_1  | (5) 0x95cED938F7991cd0dFcb48F0a06a40FA1aF46EBC (100 ETH)
            // contract_1  | (6) 0x3E5e9111Ae8eB78Fe1CC3bb8915d5D461F3Ef9A9 (100 ETH)
            // contract_1  | (7) 0x28a8746e75304c0780E011BEd21C72cD78cd535E (100 ETH)
            // contract_1  | (8) 0xACa94ef8bD5ffEE41947b4585a84BdA5a3d3DA6E (100 ETH)
            // contract_1  | (9) 0x1dF62f291b2E969fB0849d99D9Ce41e2F137006e (100 ETH)
            // contract_1  |
            // contract_1  | Private Keys
            // contract_1  | ==================
            // contract_1  | (0) 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d
            // contract_1  | (1) 0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1
            // contract_1  | (2) 0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c
            // contract_1  | (3) 0x646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913
            // contract_1  | (4) 0xadd53f9a7e588d003326d1cbf9e4a43c061aadd9bc938c843a79e7b4fd2ad743
            // contract_1  | (5) 0x395df67f0c2d2d9fe1ad08d1bc8b6627011959b79c53d7dd6a3536a33ab8a4fd
            // contract_1  | (6) 0xe485d098507f54e7733a205420dfddbe58db035fa577fc294ebd14db90767a52
            // contract_1  | (7) 0xa453611d9419d0e56f499079478fd72c37b251a94bfde4d19872c44cf65386e3
            // contract_1  | (8) 0x829e924fdf021ba3dbbc4225edfece9aca04b929d6e75613329ca6f1d31c0bb4
            // contract_1  | (9) 0xb0057716d5917badaf911b193b12b910811c1497b5bada8d7711f758981c3773
            // const pKeys = {
            //     '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1': '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d',
            //     '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0': '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1',
            //     '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b': '0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c',
            //     '0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d': '0x646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913',
            //     '0xd03ea8624C8C5987235048901fB614fDcA89b117': '0xadd53f9a7e588d003326d1cbf9e4a43c061aadd9bc938c843a79e7b4fd2ad743',
            //     '0x95cED938F7991cd0dFcb48F0a06a40FA1aF46EBC': '0x395df67f0c2d2d9fe1ad08d1bc8b6627011959b79c53d7dd6a3536a33ab8a4fd',
            //     '0x3E5e9111Ae8eB78Fe1CC3bb8915d5D461F3Ef9A9': '0xe485d098507f54e7733a205420dfddbe58db035fa577fc294ebd14db90767a52',
            //     '0x28a8746e75304c0780E011BEd21C72cD78cd535E': '0xa453611d9419d0e56f499079478fd72c37b251a94bfde4d19872c44cf65386e3',
            //     '0xACa94ef8bD5ffEE41947b4585a84BdA5a3d3DA6E': '0x829e924fdf021ba3dbbc4225edfece9aca04b929d6e75613329ca6f1d31c0bb4',
            //     '0x1dF62f291b2E969fB0849d99D9Ce41e2F137006e': '0xb0057716d5917badaf911b193b12b910811c1497b5bada8d7711f758981c3773',
            // };
            const mmSigHex = await this.web3.eth.personal.sign(hash, sender);
            // TODO: Remove when sig issue is resolved
            sigHex = await this.patchedWeb3.eth.sign(hash, sender);
            debug('Metamask/patched signatures', mmSigHex,'/', sigHex);
        } else {
            sigHex = await this.web3.eth.sign(hash, sender);
        }
        const sigBytes = this.web3.utils.hexToBytes(sigHex);
        debug('The sig length', sigBytes.length);
        // See notes about the last byte of the signature here: https://github.com/ethereum/wiki/wiki/JavaScript-API
        sigBytes[sigBytes.length - 1] = sigBytes[sigBytes.length - 1] + 27;
        return this.web3.utils.bytesToHex(sigBytes);
    }

    /**
     * Without the user's entire deposit amount
     * @param {string} sender The depositor
     * @param {Object} opts The tx options
     * @returns {Promise<*>}
     */
    async withdraw(sender, opts) {
        return this.contract.methods.withdraw().send({...opts, from: sender});
    }
}

module.exports = {CoinjoinClient, actions};
