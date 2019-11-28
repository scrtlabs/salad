// The tests in this file test the behavior of the Enigma and Ethereum Salad contracts directly,
// without starting the Salad client, operator, or frontend.

require('dotenv').config();

const {Enigma} = require('enigma-js/node');
const {getEnigmaTokenContractAddress} = require('@salad/client/src/enigmaTokenSmartContract');
const {getEnigmaContractAddress} = require('@salad/client/src/enigmaSmartContract');

const SaladContract = artifacts.require('Salad');

const web3 = global.web3;

const DEFAULT_TASK_RECOED_OPTIONS = {taskGasLimit: 4712388, taskGasPx: 100000000000};
const OPERATOR_ACCOUNT_INDEX = 0;

const getEnigmaClient = async (enigmaUrl, accounts) => {
    let enigma = new Enigma(
        web3,
        await getEnigmaContractAddress(),
        await getEnigmaTokenContractAddress(),
        enigmaUrl,
        {
            gas: DEFAULT_TASK_RECOED_OPTIONS.taskGasLimit,
            gasPrice: DEFAULT_TASK_RECOED_OPTIONS.taskGasPx,
            from: accounts[OPERATOR_ACCOUNT_INDEX],
        },
    );

    enigma.admin();
    enigma.setTaskKeyPair();

    return enigma;
};

const getSaladSmartContract = () => {
    const saladContractAddr = SaladContract.address;
    return new web3.eth.Contract(SaladContract.abi, saladContractAddr);
};

contract("Salad", () => {
    // load the Salad secret contract  // Seems to happen automatically by discovery-cli

    before(async () => {
        this.accounts = await web3.eth.getAccounts();
        const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;

        this.saladSmartContract = getSaladSmartContract();
        this.enigma = await getEnigmaClient(enigmaUrl, this.accounts);
    });

    it("should mix 3 transactions", async () => {
        const balance = await this.saladSmartContract.methods
            .getParticipantBalance(this.accounts[0])
            .call({from: this.accounts[OPERATOR_ACCOUNT_INDEX]});
    });

});
