require('dotenv').config();
const WebSocket = require('ws');
const {SUBMIT_DEPOSIT_METADATA, FETCH_FILLABLE_DEPOSITS, FETCH_CONFIG} = require("@salad/client").actions;
const {OperatorApi} = require('./api');
const debug = require('debug')('operator');
const {Store} = require("./store");

const port = process.env.WS_PORT;

async function startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex = 0) {
    const api = new OperatorApi(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex);
    await api.initAsync();

    const wss = new WebSocket.Server({port});
    debug('Starting the websocket server');
    wss.on('connection', async function connection(ws) {

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

        // Sending threshold on connection
        debug('Sending threshold value', threshold);
        const thresholdAction = api.getThreshold();
        ws.send(JSON.stringify(thresholdAction));

        await api.broadcastQuorumAsync(0);

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

module.exports = {startServer, Store};
