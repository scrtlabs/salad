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

    async registerDepositAsync(sender, amount, encRecipient) {
        console.log('Registering deposit', sender, amount, encRecipient);
        return new Promise((resolve) => {
            resolve(true);
        });
    }
}

module.exports = {DealManager};