const actions = require('./actions');
const {PUB_KEY_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS} = actions;

const EventEmitter = require('events');
const Web3 = require('web3');
const {utils} = require('enigma-js/node');
const forge = require('node-forge');
const WebSocket = require('ws');

// TODO: Move path to config and reference Github
const EnigmaCoinjoinContract = require('../../build/smart_contracts/Mixer.json');

class CoinjoinClient {
    constructor(contractAddr, operatorUrl = 'http://localhost:3346', provider = Web3.givenProvider) {
        this.web3 = new Web3(provider);
        this.ws = new WebSocket(operatorUrl);
        this.ee = new EventEmitter();
        this.pubKey = null;
        // const contractAddr = EnigmaCoinjoinContract.networks[process.env.ETH_NETWORK_ID].address;
        this.contract = new this.web3.eth.Contract(EnigmaCoinjoinContract['abi'], contractAddr);
    }

    async waitConnectAsync() {
        return new Promise((resolve) => {
            this.ws.on('open', function open() {
                console.log('Connected to server');
                resolve(true);
            });
        });
    }

    async initAsync() {
        await this.waitConnectAsync();
        this.accounts = await this.web3.eth.getAccounts();
        this.watch();
    }

    async shutdownAsync() {
        this.ws.close();
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

    async makeDepositAsync(sender, amount, opts) {
        console.log('Posting deposit to the smart contract', amount);
        const amountInWei = this.web3.utils.toWei(amount, 'ether');

        const receipt = await this.contract.methods.makeDeposit().send({...opts, from: sender, value: amountInWei})
        // const balance = await this.contract.methods.getParticipantBalance(sender).call({from: sender});
        // console.log('Got balance', balance);
        return receipt;
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

    async fetchFillableDeposits(minAmount = 0) {
        const promise = new Promise((resolve) => {
            this.ee.once(FETCH_FILLABLE_SUCCESS, (result) => resolve(result));
        });
        this.ws.send(JSON.stringify({action: FETCH_FILLABLE_DEPOSITS, payload: {minAmount}}));
        return promise;
    }

    async fetchActiveDeals() {
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