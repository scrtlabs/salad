require('dotenv').config();
const fs = require('fs');
const {CoinjoinClient} = require('../src/client');
const Web3 = require('web3');
const {startServer} = require('../src');
const WebSocket = require('ws');
const {expect} = require('chai');

describe('sockets', () => {
    let cjc;
    let opts;
    before(async () => {
        const operatorAccountIndex = 0;
        const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
        const scAddr = fs.readFileSync('../test/mixer.txt', 'utf-8');

        await startServer(provider, scAddr, operatorAccountIndex);

        const operatorUrl = `ws://localhost:${process.env.WS_PORT}`;
        cjc = new CoinjoinClient(operatorUrl, provider);
        process.on('SIGINT', async () => {
            console.log('Caught interrupt signal, shutting down WS server');
            await cjc.shutdownAsync();
            process.exit();
        });
        await cjc.initAsync();
        opts = {
            gas: 4712388,
            gasPrice: 100000000000,
        };
    });

    it('should connect to the WS server', async () => {
        console.log('Testing connection');
        const action = new Promise((resolve) => {
            cjc.ws.once('message', (msg) => {
                const {action} = JSON.parse(msg);
                resolve(action);
            });
        });
        cjc.ws.send(JSON.stringify({action: 'ping', payload: {}}));
        expect(await action).to.equal('pong');
    });

    const amount = '10';
    let sender;
    it('should make deposit on Ethereum', async () => {
        sender = cjc.accounts[1];
        const receipt = await cjc.makeDepositAsync(sender, amount, opts);
        console.log('Made deposit', receipt);
    });

    it('should submit encrypted deposit', async () => {
        const recipient = cjc.accounts[6];
        const result = await cjc.submitDepositMetadata(sender, amount, recipient);
        expect(result).to.equal(true);
    });

    it('should verify that the submitted deposit is fillable', async () => {
        const {deposits} = await cjc.fetchFillableDeposits();
        expect(deposits.length).to.equal(1);
    }).timeout(5000);
});