require('dotenv').config();
const WebSocket = require('ws');
const {SUBMIT_DEPOSIT_METADATA, FETCH_FILLABLE_DEPOSITS, FETCH_CONFIG, PING, PONG} = require("@salad/client").actions;
const {OperatorApi} = require('./api');
const debug = require('debug')('operator');
const {Store} = require("./store");
const parse = require('url-parse');

const port = process.env.WS_PORT;

async function startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex = 0) {
    const api = new OperatorApi(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex);
    await api.initAsync();

    const wss = new WebSocket.Server({port});
    const WS_CLIENT_TIMEOUT = 5000;

    function broadcast(actionData) {
        debug('Broadcasting action', actionData, 'to', wss.clients.size, 'clients');
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                debug('Found client', client.uid);
                const timeout = Date.now() - WS_CLIENT_TIMEOUT;
                debug('Comparing last ping / timeout', client.lastPing, timeout);
                if (client.lastPing > timeout) {
                    debug('Broadcasting to client', client);
                    client.send(JSON.stringify(actionData));
                } else {
                    debug('Terminating expired connection for client', client.uid);
                    client.terminate();
                }
            }
        });
    }

    // Subscribe to events to broadcast
    api.onDealCreated(broadcast);
    api.onDealExecuted(broadcast);
    api.onQuorumNotReached(broadcast);
    api.onQuorumUpdate(broadcast);
    api.onBlock(broadcast);

    debug('Starting the websocket server');
    wss.on('connection', async function connection(ws, req) {
        const params = parse(req.url, true);
        ws.uid = params.query.id;
        ws.lastPing = Date.now();

        // Sending threshold and quorum on connection
        // Send to the connected client only
        const thresholdAction = api.getThreshold();
        ws.send(JSON.stringify(thresholdAction));
        const quorumAction = await api.getQuorumAsync(0);
        ws.send(JSON.stringify(quorumAction));

        ws.on('message', async function incoming(message) {
            debug('received: %s', message);
            wss.clients.forEach((client) => {
                if (client.uid === ws.uid) {
                    ws.lastPing = Date.now();
                    return true;
                }
            });
            const {action, payload} = JSON.parse(message);
            switch (action) {
                case PING:
                    ws.send(JSON.stringify({action: PONG, payload: {}}));
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
