require('dotenv').config();
const fs = require('fs');
const {CoinjoinClient} = require('enigma-coinjoin-client');
const {startServer} = require('enigma-coinjoin-operator');
const {expect} = require('chai');
const SaladContract = artifacts.require('Salad');

const EnigmaTokenContract = require('../build/enigma_contracts/EnigmaToken.json');
const EnigmaContract = require('../build/enigma_contracts/Enigma.json');
// const EnigmaContract = artifacts.require('Enigma');
const {DEALS_COLLECTION, DEPOSITS_COLLECTION} = require('enigma-coinjoin-operator/src/store');

contract('Salad', () => {
    let cjc;
    let opts;
    let token;
    let web3Utils;
    let accounts;
    before(async () => {
        const operatorAccountIndex = 0;
        const provider = web3._provider;
        const scAddr = fs.readFileSync(`${__dirname}/salad.txt`, 'utf-8');
        const threshold = 2;
        const saladContractAddr = SaladContract.address;
        const enigmaContractAddr = EnigmaContract.networks[process.env.ETH_NETWORK_ID].address;
        const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
        const server = await startServer(provider, enigmaUrl, saladContractAddr, scAddr, threshold, operatorAccountIndex);
        await server.store.truncate(DEPOSITS_COLLECTION);
        await server.store.truncate(DEALS_COLLECTION);

        const operatorUrl = `ws://localhost:${process.env.WS_PORT}`;
        cjc = new CoinjoinClient(saladContractAddr, enigmaContractAddr, operatorUrl, provider);
        // Always shutdown the WS server when tests end
        process.on('SIGINT', async () => {
            console.log('Caught interrupt signal, shutting down WS server');
            await cjc.shutdownAsync();
            await server.shutdownAsync();
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

    let amount;
    let sender;
    it('should make deposit on Ethereum', async () => {
        amount = web3Utils.toWei('10');
        sender = cjc.accounts[1];
        const receipt = await cjc.makeDepositAsync(sender, amount, opts);
        expect(receipt.status).to.equal(true);
    });

    let encRecipient;
    let pubKey;
    it('should encrypt deposit', async () => {
        const recipient = cjc.accounts[6];
        encRecipient = await cjc.encryptRecipientAsync(recipient);
        pubKey = cjc.keyPair.publicKey;
    }).timeout(60000); // Giving more time because fetching the pubKey

    let signature;
    it('should make sign the deposit payload', async () => {
        signature = await cjc.signDepositMetadataAsync(sender, amount, encRecipient, pubKey);
        console.log('The signature', signature);
        const sigBytes = web3Utils.hexToBytes(signature);
        console.log('The signature length', sigBytes.length, sigBytes);
        expect(sigBytes.length).to.equal(65);
    });

    it('should submit signed deposit payload', async () => {
        console.log('Testing despost submit with signature', signature);
        const result = await cjc.submitDepositMetadataAsync(sender, amount, encRecipient, pubKey, signature);
        expect(result).to.equal(true);
        // Quorum should be 1 after first deposit
        expect(cjc.quorum).to.equal(1);
    }).timeout(5000);

    it('should verify that the submitted deposit is fillable', async () => {
        const {deposits} = await cjc.fetchFillableDepositsAsync();
        expect(deposits.length).to.equal(1);
    }).timeout(5000);

    it('should make second deposit on Ethereum', async () => {
        sender = cjc.accounts[2];
        const receipt = await cjc.makeDepositAsync(sender, amount, opts);
        console.log('Made deposit', receipt);
        expect(cjc.quorum).to.equal(1);
    });

    it('should encrypt second deposit', async () => {
        const recipient = cjc.accounts[7];
        encRecipient = await cjc.encryptRecipientAsync(recipient);
        pubKey = cjc.keyPair.publicKey;
    }).timeout(60000); // Giving more time because fetching the pubKey

    it('should sign the second deposit payload', async () => {
        signature = await cjc.signDepositMetadataAsync(sender, amount, encRecipient, pubKey);
        console.log('Got signature', signature);
    });

    let dealPromise;
    let executedDealPromise;
    it('should submit signed second deposit payload', async () => {
        console.log('Testing despost submit with signature', signature);
        const result = await cjc.submitDepositMetadataAsync(sender, amount, encRecipient, pubKey, signature);
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
