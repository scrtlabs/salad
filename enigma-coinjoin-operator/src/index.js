require('dotenv').config();
const WebSocket = require('ws');
const {SUBMIT_DEPOSIT_METADATA, FETCH_FILLABLE_DEPOSITS} = require("enigma-coinjoin-client").actions;
const {OperatorApi} = require('./api');

const port = process.env.WS_PORT;

async function startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex = 0) {
    const api = new OperatorApi(provider, enigmaUrl, contractAddr, scAddr, threshold, accountIndex);
    await api.initAsync();

    const wss = new WebSocket.Server({port});
    console.log('Starting the websocket server');
    wss.on('connection', async function connection(ws) {

        function broadcast(actionData) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    console.log('Broadcasting action', actionData);
                    client.send(JSON.stringify(actionData));
                }
            });
        }

        // Subscribe to events to broadcast
        api.onDealCreated(broadcast);
        api.onDealExecuted(broadcast);
        api.onQuorumUpdate(broadcast);

        // Loading non-blocking to keep the startup sequence sane
        (async () => {
            // Sending public key on connection
            const pubKeyAction = await api.getEncryptionPubKeyAsync();
            ws.send(JSON.stringify(pubKeyAction));
        })();

        // Sending threshold on connection
        console.log('Sending threshold value', threshold);
        const thresholdAction = api.getThreshold();
        ws.send(JSON.stringify(thresholdAction));

        const quorumAction = await api.fetchQuorumAsync(0);
        console.log('Sending quorum value', quorumAction);
        ws.send(JSON.stringify(quorumAction));

        ws.on('message', async function incoming(message) {
            console.log('received: %s', message);
            const {action, payload} = JSON.parse(message);
            switch (action) {
                case 'ping':
                    console.log('Sending pong');
                    ws.send(JSON.stringify({action: 'pong', payload: {}}));
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
    console.log('Server started on port', port);
    return wss;
}

module.exports = {startServer};
