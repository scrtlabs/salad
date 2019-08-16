require('dotenv').config();
const fs = require('fs');
const {startServer} = require('enigma-coinjoin-operator');
const Web3 = require('web3');

const MixerContract = require('../../build/smart_contracts/Mixer.json');

(async () => {
    const operatorAccountIndex = 0;
    const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`)
    const scAddr = fs.readFileSync(`${__dirname}/../../test/coinjoin.txt`, 'utf-8');
    const threshold = 2;
    const contractAddr = MixerContract.networks[process.env.ETH_NETWORK_ID].address;
    const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
    console.log('Contract address:', contractAddr);
    await startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, operatorAccountIndex);
})();
