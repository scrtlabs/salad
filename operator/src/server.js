require('dotenv').config();
const {startServer} = require('@salad/operator');
const Web3 = require('web3');
const debug = require('debug')('operator:server');
const {Store, configureWeb3Account} = require("@salad/operator");
const {DEPOSITS_COLLECTION, DEALS_COLLECTION, CACHE_COLLECTION} = require('./store');
const {mineUntilDeal} = require('@salad/operator/src/ganacheUtils');

const args = process.argv;
const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
let server;
async function main() {
    const store = new Store();
    await store.initAsync();

    const threshold = process.env.PARTICIPATION_THRESHOLD;
    const scAddr = await store.fetchSecretContractAddr();
    const contractAddr = await store.fetchSmartContractAddr();
    const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
    await store.closeAsync();
    const web3 = new Web3(provider);
    await configureWeb3Account(web3);
    server = await startServer(web3, enigmaUrl, contractAddr, scAddr, threshold);

    // -t: Truncate db - Truncate the Deposits, Deals and Cache collections
    if (args.indexOf('-t') !== -1) {
        debug('-t option provided, truncating the db');
        // Truncating the database
        await server.store.truncate(DEPOSITS_COLLECTION);
        await server.store.truncate(DEALS_COLLECTION);
        await server.store.truncate(CACHE_COLLECTION);
    }

    // -i: Ignore deal interval - Mining blocks until new deal when the anonymity set is reached (Ganache only)
    if (args.indexOf('-i') !== -1) {
        debug('-i option provided, watching for quorum updates');
        server.onQuorumUpdate(async (action) => {
            debug('Quorum update', action);
            const {quorum} = action.payload;
            if (parseInt(quorum) >= parseInt(threshold)) {
                debug('Quorum reached with -i option, mining blocks until deal');
                await mineUntilDeal(web3, server);
            }
        });
    }

    // Fetch the encryption pub key and put in cache
    await server.loadEncryptionPubKeyAsync();
    // Watch blocks and update create deals when reaching thresholds
    await server.watchBlocksUntilDeal();
}

main().catch(err => { console.error(err); process.exit(1) });
