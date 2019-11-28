require('dotenv').config();
const fs = require('fs');

const {expect} = require("chai");

const Web3  = require("web3");

const {Enigma} = require('enigma-js/node');
// const saladContractAbi = require('../build/smart_contracts/Salad.json');
const {EnigmaTokenContract} = require('@salad/client/src/enigmaTokenSmartContract');
const {EnigmaContract} = require('@salad/client/src/enigmaSmartContract');

const ETH_HOST = process.env.ETH_HOST || 'localhost';
const ETH_PORT = process.env.ETH_PORT || '9545';
const ETH_NODE = `http://${ETH_HOST}:${ETH_PORT}`;
const ETH_NETWORK_ID = process.env.ETH_NETWORK_ID || '4447';
const ENIGMA_HOST = process.env.ENIGMA_HOST || 'localhost';
const ENIGMA_PORT = process.env.ENIGMA_PORT || '3333';
const ENIGMA_NODE = `http://${ENIGMA_HOST}:${ENIGMA_PORT}`;

const ETH_ENIGMA_ADDRESS = EnigmaContract.networks[ETH_NETWORK_ID].address;
const ETH_ENIGMA_TOKEN_ADDRESS = EnigmaTokenContract.networks[ETH_NETWORK_ID].address;
const ENIGMA_SALAD_ADDRESS = fs.readFileSync('test/salad.txt');

const DEFAULT_TASK_RECORD_OPTIONS = {taskGasLimit: 4712388, taskGasPx: 100000000000};

contract("Foo", () => {
    let web3 = null;
    // let enigma = null;
    let ethAccounts = null;
    let operatorEthAccount = null;
    let saladContract = null;

    before(async () => {
        const provider = new Web3.providers.HttpProvider(ETH_NODE);
        web3 = new Web3(provider);
        ethAccounts = await web3.eth.getAccounts();
        operatorEthAccount = ethAccounts[0];

        // enigma = new Enigma(
        //     web3,
        //     ETH_ENIGMA_ADDRESS,
        //     ETH_ENIGMA_TOKEN_ADDRESS,
        //     ENIGMA_NODE,
        //     {
        //         gas: DEFAULT_TASK_RECORD_OPTIONS.taskGasLimit,
        //         gasPrice: DEFAULT_TASK_RECORD_OPTIONS.taskGasPx,
        //         from: operatorEthAccount,
        //     },
        // );
        // enigma.admin();
        // enigma.setTaskKeyPair();

        // Load the salad smart contract
        // saladContract = new web3.eth.Contract(saladContractAbi.abi);
        // const Command = require("@truffle/core/lib/command");
        // const command = new Command(require("@truffle/core/lib/commands"));
        // command.run(['migrate'], {logger: console}, (error) => { throw error; });

    });

    it("should print", async () => {
        throw 'foo!';
        const saladContractAbi = require('../build/smart_contracts/Salad.json');
        console.log(saladContractAbi.networks);
    });
});
