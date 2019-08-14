const {Enigma, utils, eeConstants} = require('enigma-js/node');
const Web3 = require('web3');

// TODO: Move path to config and reference Github
const EnigmaCoinjoinContract = require('../../build/smart_contracts/Mixer.json');

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
        return deposit;
    }

    async createDealIfQuorumReachedAsync(opts, amount = 0) {
        const deposits = await this.fetchFillableDeposits(amount);
        console.log('Evaluating quorum', deposits.length, 'against threshold', this.threshold);
        let deal = null;
        if (deposits.length >= this.threshold) {
            console.log('Quorum reached with deposits', deposits);
            deal = await this.createDeal(deposits);
        }
        return deal;
    }

    async fetchFillableDeposits(minimumAmount = 0) {
        return new Promise((resolve) => {
            resolve(this.store.queryFillableDeposits(minimumAmount));
        });
    }

    async createDeal(deposits, opts) {
        const dealId = this.web3.utils.keccak256(JSON.stringify(deposits)); // TODO: Add uniqueness
        // this.store.insertDeal(dealId, deposits);
        console.log('Creating deal with deposits', dealId, deposits);
        // TODO: Assuming that all deposits are equal for now
        const depositAmount = this.web3.utils.toWei(deposits[0].amount);
        const participants = deposits.map((deposit) => deposit.sender);
        // TODO: Return the deal attributes
        return this.contract.methods.newDeal(dealId, depositAmount, participants).send({
            ...opts,
            gas: this.gasValues.createDeal,
            from: this.scClient.getOperatorAccount(),
        });
    }
}

module.exports = {DealManager};