require('dotenv').config();
const WebSocket = require('ws');
const {SUBMIT_DEPOSIT_METADATA, FETCH_FILLABLE_DEPOSITS, FETCH_CONFIG} = require("@salad/client").actions;
const {OperatorApi} = require('./api');
const debug = require('debug')('operator');
const {Store} = require("./store");

const port = process.env.WS_PORT;

// This method tries to create an ethereum account from a private key provided from the environment.
// If no private key is found, it attempts to fetch the unlocked accounts from the ethereum node,
// and chooses the first one.
// If that fails too, an error is thrown.
async function configureWeb3Account(web3) {
    let address;
    if (process.env.OPERATOR_ETH_PRIVATE_KEY) {
        const account = web3.eth.accounts.privateKeyToAccount(process.env.OPERATOR_ETH_PRIVATE_KEY);
        web3.eth.accounts.wallet.add(account);
        address = account.address;
    } else {
        const accounts = await web3.eth.getAccounts();
        if (accounts.length > 0) {
            address = accounts[0];
        } else {
            throw new Error("Could not find or generate available account!")
        }
    }
    debug(`Using the following ethereum account for the operator: ${address}`);
    web3.eth.defaultAccount = address;
    return address;
}


async function startServer(web3, enigmaUrl, contractAddr, scAddr, threshold) {
    const api = new OperatorApi(web3, enigmaUrl, contractAddr, scAddr, threshold);
    await api.initAsync();

    const wss = new WebSocket.Server({port});
    debug('Starting the websocket server');

    function broadcast(actionData) {
        debug('Broadcasting action', actionData, 'to', wss.clients.size, 'clients');
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(actionData));
            }
        });
    }

    // Subscribe to events to broadcast
    api.onDealCreated(broadcast);
    api.onDealExecuted(broadcast);
    api.onQuorumNotReached(broadcast);
    api.onQuorumUpdate(broadcast);
    api.onBlock(broadcast);

    wss.on('connection', async function connection(ws) {
        // Sending threshold on connection
        debug('Sending threshold value', threshold);
        const thresholdAction = api.getThreshold();
        ws.send(JSON.stringify(thresholdAction));
        const quorumAction = await api.getQuorumAsync(0);
        ws.send(JSON.stringify(quorumAction));

        ws.on('message', async function incoming(message) {
            debug('received: %s', message);
            const {action, payload} = JSON.parse(message);
            switch (action) {
                case 'ping':
                    ws.send(JSON.stringify({action: 'pong', payload: {}}));
                    break;
                case FETCH_CONFIG:
                    const configAction = await api.fetchConfigAsync();
                    ws.send(JSON.stringify(configAction));
                    break;
                case SUBMIT_DEPOSIT_METADATA:
                    const {sender, amount, pubKey, encRecipient, signature} = payload;
                    const submitDepositMetadataAction = await api.submitDepositMetadataAsync(sender, amount, pubKey, encRecipient, signature);
                    ws.send(JSON.stringify(submitDepositMetadataAction));
                    break;
                case FETCH_FILLABLE_DEPOSITS:
                    const {minimumAmount} = payload;
                    const fetchFillableDepositsAction = await api.fetchFillableDepositsAsync(minimumAmount);
                    ws.send(JSON.stringify(fetchFillableDepositsAction));
                    break;
                default:
                    throw new Error(`Unsupported action: ${action}`);
            }
        });
    });
    debug('Server started on port', port);
    return api;
}

module.exports = {configureWeb3Account, startServer, Store};
