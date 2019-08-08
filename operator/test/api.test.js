require('dotenv').config();
const {CoinjoinClient} = require('../src/client');
const Web3 = require('web3');
const {startServer} = require('../src');
const WebSocket = require('ws');
const {expect} = require('chai');

describe('sockets', () => {
    let ws;
    let cjc;
    before(async () => {
        const operatorAccountIndex = 0;
        const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
        const scAddr = fs.readFileSync('test/mixer.txt', 'utf-8');
        await startServer(provider, scAddr, operatorAccountIndex);
        const operatorUrl = `ws://localhost:${process.env.WS_PORT}`;
        ws = new WebSocket(operatorUrl);

        cjc = new CoinjoinClient(operatorUrl, provider);
        await cjc.initAsync();

        return new Promise((resolve) => {
            ws.on('open', function open() {
                console.log('Connected to server');
                resolve(true);
            });
        });
    });

    it('should connect to the WS server', async () => {
        console.log('Testing connection');
        const action = new Promise((resolve) => {
            ws.once('message', (msg) => {
                const {action} = JSON.parse(msg);
                resolve(action);
            });
        });
        ws.send(JSON.stringify({action: 'ping', payload: {}}));
        expect(await action).to.equal('pong');
    });

    it('should submit encrypted deposit', async () => {
        console.log('Testing connection');
        const amount = 10;
        const recipient = cjc.accounts[1];
        const receipt = await cjc.makeDepositAsync(amount);
        const result = await cjc.submitDepositMetadata(amount, recipient);
        expect(result).to.equal(true);
    });
});