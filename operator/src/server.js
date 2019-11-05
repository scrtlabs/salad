require('dotenv').config();
const {startServer} = require('@salad/operator');
const Web3 = require('web3');
const debug = require('debug')('operator:server');
const {Store} = require("@salad/operator");
const {DEPOSITS_COLLECTION, DEALS_COLLECTION, CACHE_COLLECTION} = require('./store');

const args = process.argv;
const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
let server;
(async () => {
    const operatorAccountIndex = 0;
    const store = new Store();
    await store.initAsync();

    const threshold = process.env.PARTICIPATION_THRESHOLD;
    const scAddr = await store.fetchSecretContractAddr();
    const contractAddr = await store.fetchSmartContractAddr();
    const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
    await store.closeAsync();
    server = await startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, operatorAccountIndex);
    if (args.indexOf('-t') !== -1) {
        debug('-t option provided, truncating the db');
        // Truncating the database
        await server.store.truncate(DEPOSITS_COLLECTION);
        await server.store.truncate(DEALS_COLLECTION);
        await server.store.truncate(CACHE_COLLECTION);
    }
    // Fetch the encryption pub key and put in cache
    await server.loadEncryptionPubKeyAsync();
    // Watch blocks and update create deals when reaching thresholds
    await server.watchBlocksUntilDeal();
})();
