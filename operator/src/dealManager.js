const {Enigma, utils, eeConstants} = require('enigma-js/node');
const Web3 = require('web3');

// TODO: Move path to config and reference Github
const EnigmaCoinjoinContract = require('../../build/smart_contracts/Mixer.json');

class DealManager {
    constructor(web3, scClient, store, participantThreshold = 2) {
        this.web3 = web3;
        this.scClient = scClient;
        this.store = store;
        this.participantThreshold = participantThreshold;
    }

    async verifyDepositAmountAsync(sender, amount) {
        return new Promise((resolve) => {
            resolve(true);
        });
    }

    async registerDepositAsync(sender, amount, encRecipient) {
        console.log('Registering deposit', sender, amount, encRecipient);
        await this.verifyDepositAmountAsync(sender, amount);
        const deposit = {sender, amount, encRecipient};
        this.store.insertDeposit(deposit);
    }

    async fetchFillableDeposits(minimumAmount = 0) {
        return new Promise((resolve) => {
            resolve(this.store.queryFillableDeposits(minimumAmount));
        });
    }

    async createDeal(deposits) {
        const dealId = this.web3.utils.keccak256(JSON.stringify(deposits)); // TODO: Add uniqueness
        this.store.insertDeal(dealId, deposits);
    }
}

module.exports = {DealManager};