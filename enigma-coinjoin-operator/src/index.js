require('dotenv').config();
const WebSocket = require('ws');
const {PUB_KEY_UPDATE, DEAL_CREATED_UPDATE, DEAL_EXECUTED_UPDATE, QUORUM_UPDATE, THRESHOLD_UPDATE, SUBMIT_DEPOSIT_METADATA, SUBMIT_DEPOSIT_METADATA_SUCCESS, FETCH_FILLABLE_DEPOSITS, FETCH_FILLABLE_SUCCESS, FETCH_FILLABLE_ERROR} = require("enigma-coinjoin-client").actions;
const {OperatorApi} = require('./api');

const port = process.env.WS_PORT;

async function startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex = 0) {
    const api = new OperatorApi(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex);
    await api.initAsync();

    const wss = new WebSocket.Server({port});
    console.log('Starting the websocket server');
    wss.on('connection', async function connection(ws) {

        function broadcast(data) {
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    console.log('Broadcasting action', data);
                    client.send(JSON.stringify(data));
                }
            });
        }

        // Subscribe to events to broadcast
        api.onDealCreated(broadcast);
        api.onDealExecuted(broadcast);
        api.onQuorumUpdate(broadcast);

        (async () => {
            // Sending public key on connection
            const pubKey = await api.cachePublicKeyAsync();
            ws.send(JSON.stringify({action: PUB_KEY_UPDATE, payload: {pubKey}}));
        })();

        // Sending threshold on connection
        console.log('Sending threshold value', threshold);
        ws.send(JSON.stringify({action: THRESHOLD_UPDATE, payload: {threshold}}));

        const quorum = await api.fetchQuorumAsync(0);
        console.log('Sending quorum value', quorum);
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
                    const submitDepositMetadataAction = await api.submitDepositMetadataAsync(sender, amount, pubKey, encRecipient);
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
    console.log('Server started on port', port);
    return wss;
}

module.exports = {startServer};
