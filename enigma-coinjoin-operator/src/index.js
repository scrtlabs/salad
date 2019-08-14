require('dotenv').config();
const {SecretContractClient} = require("./secretContractClient");
const {Store} = require("./store");
const {MemoryStore} = require("./memoryStore");
const WebSocket = require('ws');
const {PUB_KEY_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS, FETCH_FILLABLE_ERROR} = require("enigma-coinjoin-client").actions;
const Web3 = require('web3');
const {DealManager} = require("./dealManager");

const port = process.env.WS_PORT;

async function startServer(provider, contractAddr, scAddr, accountIndex = 0) {
    // const store = new Store();
    const store = new MemoryStore(); // TODO: Use db backend
    await store.initAsync();

    const web3 = new Web3(provider);
    const sc = new SecretContractClient(web3, scAddr, accountIndex);
    await sc.initAsync();

    const quorum = parseInt(process.env.QUORUM);
    const dealManager = new DealManager(web3, sc, contractAddr, store, quorum);

    const opts = {
        gas: 100712388,
        gasPrice: process.env.GAS_PRICE,
    };

    process.on('SIGINT', async () => {
        console.log('Caught interrupt signal');

        await store.closeAsync();
        process.exit();
    });

    const wss = new WebSocket.Server({port});
    console.log('Starting the websocket server');
    wss.on('connection', async function connection(ws) {
        console.log('Sending encryption public key to new connected client');
        const pubKey = await sc.getPubKeyAsync();
        ws.send(JSON.stringify({action: PUB_KEY_UPDATE, payload: {pubKey}}));

        ws.on('message', async function incoming(message) {
            console.log('received: %s', message);
            const {action, payload} = JSON.parse(message);
            switch (action) {
                case 'ping':
                    console.log('Sending pong');
                    ws.send(JSON.stringify({action: 'pong', payload: {}}));
                    break;
                case SUBMIT_DEPOSIT_METADATA:
                    const {sender, amount, encRecipient} = payload;
                    await dealManager.registerDepositAsync(sender, amount, encRecipient);
                    // TODO: Not sure if it is the best place to put this
                    await dealManager.createDealIfQuorumReachedAsync(opts);
                    ws.send(JSON.stringify({action: SUBMIT_DEPOSIT_METADATA_SUCCESS, payload: true}));
                    break;
                case FETCH_FILLABLE_DEPOSITS:
                    const {minimumAmount} = payload;
                    const deposits = await dealManager.fetchFillableDeposits(minimumAmount);
                    ws.send(JSON.stringify({action: FETCH_FILLABLE_SUCCESS, payload: {deposits}}));
                    break;
                default:
                    throw new Error(`Unsupported action: ${action}`);
            }
        });
    });
    console.log('Server started on port', port);
    return wss;
}

module.exports = {startServer};
