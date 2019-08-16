require('dotenv').config();
const fs = require('fs');
const {CoinjoinClient} = require('enigma-coinjoin-client');
const {startServer} = require('enigma-coinjoin-operator');
const {expect} = require('chai');
const MixerContract = artifacts.require("Mixer");

const EnigmaTokenContract = require('../build/enigma_contracts/EnigmaToken.json');

contract('Mixer', () => {
    let cjc;
    let opts;
    let token;
    let web3Utils;
    let accounts;
    before(async () => {
        const operatorAccountIndex = 0;
        const provider = web3._provider;
        const scAddr = fs.readFileSync(`${__dirname}/coinjoin.txt`, 'utf-8');
        const threshold = 2;
        const contractAddr = web3.utils.toChecksumAddress(MixerContract.address);
        const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
        console.log('Contract address:', contractAddr);
        await startServer(provider, enigmaUrl, contractAddr, scAddr, threshold, operatorAccountIndex);

        const operatorUrl = `ws://localhost:${process.env.WS_PORT}`;
        cjc = new CoinjoinClient(contractAddr, operatorUrl, provider);
        // Always shutdown the WS server when tests end
        process.on('SIGINT', async () => {
            console.log('Caught interrupt signal, shutting down WS server');
            await cjc.shutdownAsync();
            process.exit();
        });
        await cjc.initAsync();
        // Convenience shortcuts
        web3Utils = web3.utils;
        accounts = cjc.accounts;
        // Default options of client-side transactions
        opts = {
            gas: 4712388,
            gasPrice: 100000000000,
        };
        const tokenAddr = EnigmaTokenContract.networks[process.env.ETH_NETWORK_ID].address;
        token = new web3.eth.Contract(EnigmaTokenContract['abi'], tokenAddr);

    });

    it('should connect to the WS server', async () => {
        console.log('Testing connection');
        const action = new Promise((resolve) => {
            cjc.ws.once('message', (msg) => {
                const {action} = JSON.parse(msg);
                if (action === 'pong') {
                    resolve(action);
                }
            });
        });
        cjc.ws.send(JSON.stringify({action: 'ping', payload: {}}));
        await action;
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
        const encRecipient = await cjc.encryptRecipientAsync(recipient);
        const myPubKey = cjc.keyPair.publicKey;
        const result = await cjc.submitDepositMetadataAsync(sender, amount, myPubKey, encRecipient);
        expect(result).to.equal(true);
        // Quorum should be 1 after first deposit
        expect(cjc.quorum).to.equal(1);
    }).timeout(60000); // Giving more time because fetching the pubKey

    it('should verify that the submitted deposit is fillable', async () => {
        const {deposits} = await cjc.fetchFillableDepositsAsync();
        expect(deposits.length).to.equal(1);
    }).timeout(5000);

    it('should make a second deposit on Ethereum', async () => {
        sender = cjc.accounts[2];
        const receipt = await cjc.makeDepositAsync(sender, amount, opts);
        console.log('Made deposit', receipt);
        // Quorum should still be 1 since the deposit hasn't been received by the operator yet
        expect(cjc.quorum).to.equal(1);
    });

    let dealPromise;
    let executedDealPromise;
    it('should submit the second encrypted deposit', async () => {
        const recipient = cjc.accounts[7];
        const encRecipient = await cjc.encryptRecipientAsync(recipient);
        const myPubKey = cjc.keyPair.publicKey;
        // Since the threshold is 2, this will also create a deal
        const result = await cjc.submitDepositMetadataAsync(sender, amount, myPubKey, encRecipient);
        // Catching the deal created event
        dealPromise = new Promise((resolve) => {
            cjc.onDealCreated((deal) => resolve(deal));
        });
        executedDealPromise = new Promise((resolve) => {
            cjc.onDealExecuted((deal) => resolve(deal));
        });
        expect(result).to.equal(true);
        // Quorum should be 2 after first deposit
        expect(cjc.quorum).to.equal(2);
    }).timeout(5000);

    it('should verify that both submitted deposits are fillable', async () => {
        const {deposits} = await cjc.fetchFillableDepositsAsync();
        expect(deposits.length).to.equal(2);
    }).timeout(5000);

    it('should verify that a deal was created since the threshold is reached', async () => {
        const deal = await dealPromise;
        console.log('Created deal', deal);
        const deals = await cjc.findDealsAsync(1);
        expect(deals.length).to.equal(1);
        // Quorum should be reset to 0 after deal creation
        expect(cjc.quorum).to.equal(0);
    }).timeout(60000); // Give enough time to execute the deal on Enigma

    it('should verify the deal execution', async () => {
        const deal = await executedDealPromise;
        console.log('Executed deal', deal);
        const deals = await cjc.findDealsAsync(2);
        // expect(deals.length).to.equal(1);
        // Quorum should be reset to 0 after deal creation
        expect(cjc.quorum).to.equal(0);
    }).timeout(120000);
});