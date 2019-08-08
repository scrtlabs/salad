const {PUB_KEY_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS} = require("./actions");

const Web3 = require('web3');
const {utils} = require('enigma-js/node');
const forge = require('node-forge');
const WebSocket = require('ws');

// TODO: For browser implementation, get JSON files form github
const EnigmaContract = require('../../build/enigma_contracts/Enigma.json');
const EnigmaTokenContract = require('../../build/enigma_contracts/EnigmaToken.json');

class CoinjoinClient {
    constructor(operatorUrl = 'http://localhost:3346', provider = Web3.givenProvider) {
        this.web3 = new Web3(provider);
        this.ws = new WebSocket(operatorUrl);
        this.ee = new EventEmitter();
        this.pubKey = null;
    }

    async initAsync() {
        this.accounts = await this.web3.eth.getAccounts();
        this.watch();
    }

    watch() {
        this.ws.on('message', (msg) => {
            const {action, payload} = JSON.parse(msg);
            switch (action) {
                case PUB_KEY_UPDATE:
                    const pubKey = {payload};
                    this.pubKey = pubKey;
                    break;
                default:
                    this.ee.emit(action, payload);
            }
        });
    }

    async makeDepositAsync(sender, amount) {
        console.log('Posting deposit to the smart contract', amount);
    }

    async encryptRecipient(recipient) {
        if (!this.pubKey) {
            throw new Error('Public encryption key not available');
        }
        return utils.encryptMessage(this.pubKey, recipient);
    }

    async submitDepositMetadata(sender, amount, encRecipient) {
        console.log('Submitting deposit metadata to the operator', amount, encRecipient);
        const promise = new Promise((resolve) => {
            this.ee.once(SUBMIT_DEPOSIT_METADATA_SUCCESS, (result) => resolve(result));
        });
        this.ws.send(JSON.stringify({action: SUBMIT_DEPOSIT_METADATA, payload: {sender, amount, encRecipient}}));
        return promise;
    }
}

module.exports = {CoinjoinClient};