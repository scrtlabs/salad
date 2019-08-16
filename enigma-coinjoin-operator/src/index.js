require('dotenv').config();
const {SecretContractClient} = require("./secretContractClient");
const {Store} = require("./store");
const {MemoryStore} = require("./memoryStore");
const WebSocket = require('ws');
const {PUB_KEY_UPDATE, DEAL_CREATED_UPDATE, QUORUM_UPDATE, THRESHOLD_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS, FETCH_FILLABLE_ERROR} = require("enigma-coinjoin-client").actions;
const Web3 = require('web3');
const {DealManager} = require("./dealManager");
const {utils} = require('enigma-js/node');

const port = process.env.WS_PORT;

// TODO: Getting ugly, consider creating a class
async function startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex = 0) {
    // const store = new Store();
    const store = new MemoryStore(); // TODO: Use db backend
    await store.initAsync();

    const web3 = new Web3(provider);
    const sc = new SecretContractClient(web3, scAddr, enigmaUrl, accountIndex);

    // TODO: Default Enigma options, add to config
    const defaultEngOpts = {taskGasLimit: 4712388, taskGasPx: 100000000000};
    await sc.initAsync(defaultEngOpts);

    const dealManager = new DealManager(web3, sc, contractAddr, store, threshold);

    // TODO: Default Ethereum options, add to config
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

        function broadcast(data) {
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    console.log('Broadcasting action', data);
                    client.send(JSON.stringify(data));
                }
            });
        }

        async function postDeposit() {
            console.log('Evaluating deal creation in non-blocking scope');
            const taskRecordOpts = {taskGasLimit: 50000000, taskGasPx: utils.toGrains(1)};
            const deal = await dealManager.createDealIfQuorumReachedAsync(opts, taskRecordOpts);
            if (deal !== null) {
                console.log('Broadcasting new deal');
                broadcast({action: DEAL_CREATED_UPDATE, payload: {deal}});
                console.log('Broadcasting quorum value 0 after new deal');
                const fillableDeposits = await dealManager.fetchFillableDepositsAsync();
                console.log('Fillable deposits after deal', fillableDeposits);
                const quorum = fillableDeposits.length;
                if (quorum !== 0) {
                    throw new Error('Data corruption, the quorum should be 0 after creating a deal');
                }
                broadcast({action: QUORUM_UPDATE, payload: {quorum}});
            }
        }

        (async () => {
            // Sending public key on connection
            const taskRecordOpts = {taskGasLimit: 5000000, taskGasPx: utils.toGrains(1)};
            const pubKey = await sc.getPubKeyAsync(taskRecordOpts);
            ws.send(JSON.stringify({action: PUB_KEY_UPDATE, payload: {pubKey}}));
        })();

        // Sending threshold on connection
        ws.send(JSON.stringify({action: THRESHOLD_UPDATE, payload: {threshold}}));

        // Sending current quorum on connection
        const fillableDeposits = await dealManager.fetchFillableDepositsAsync();
        const quorum = fillableDeposits.length;
        ws.send(JSON.stringify({action: QUORUM_UPDATE, payload: {quorum}}));

        ws.on('message', async function incoming(message) {
            console.log('received: %s', message);
            const {action, payload} = JSON.parse(message);
            switch (action) {
                case 'ping':
                    console.log('Sending pong');
                    ws.send(JSON.stringify({action: 'pong', payload: {}}));
                    break;
                case SUBMIT_DEPOSIT_METADATA:
                    const {sender, amount, pubKey, encRecipient} = payload;
                    const registeredDeposit = await dealManager.registerDepositAsync(sender, amount, pubKey, encRecipient);
                    console.log('Registered deposit', registeredDeposit);

                    const fillableDeposits = await dealManager.fetchFillableDepositsAsync();
                    const quorum = fillableDeposits.length;
                    ws.send(JSON.stringify({action: SUBMIT_DEPOSIT_METADATA_SUCCESS, payload: true}));

                    console.log('Broadcasting quorum update', quorum);
                    broadcast({action: QUORUM_UPDATE, payload: {quorum}});

                    // Non-blocking, do not wait for the outcome of port-processing
                    postDeposit();
                    break;
                case FETCH_FILLABLE_DEPOSITS:
                    const {minimumAmount} = payload;
                    const deposits = await dealManager.fetchFillableDepositsAsync(minimumAmount);
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
