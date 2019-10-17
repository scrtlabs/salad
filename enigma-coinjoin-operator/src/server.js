require('dotenv').config();
const fs = require('fs');
const {startServer} = require('enigma-coinjoin-operator');
const Web3 = require('web3');

const SaladContract = require('../../build/smart_contracts/Salad');

(async () => {
    const operatorAccountIndex = 0;
    const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
    const scAddr = fs.readFileSync(`${__dirname}/../../test/coinjoin.txt`, 'utf-8');
    const threshold = 2;
    const contractAddr = SaladContract.networks[process.env.ETH_NETWORK_ID].address;
    const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
    const server = await startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, operatorAccountIndex);
    await server.loadEncryptionPubKeyAsync();
})();
