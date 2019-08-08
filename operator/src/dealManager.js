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
        // const networkId = process.env.ETH_NETWORK_ID;
        // console.log(networkId, EnigmaCoinjoinContract);
        // const contractAddr = EnigmaCoinjoinContract.networks[networkId].address;
        const contractAddr = this.web3.utils.toChecksumAddress(process.env.CONTRACT_ADDRESS);
        const txDefaults = {
            gas: 4712388,
            gasPrice: 100000000000,
        };
        this.contract = new this.web3.eth.Contract(EnigmaCoinjoinContract['abi'], contractAddr, txDefaults);
    }

    async verifyDepositAmountAsync(sender, amount) {
        console.log('Verifying balance for deposit', sender, amount);
        const account = this.web3.utils.toChecksumAddress(sender);
        const balance = await this.contract.methods.getParticipantBalance(account).call({from: this.scClient.getOperatorAccount()});
        const amountInWei = this.web3.utils.toWei(amount);
        console.log('Comparing balance with amount', balance, amountInWei);
        return (this.web3.utils.toBN(balance) >= this.web3.utils.toBN(amountInWei));
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