require('dotenv').config();
const fs = require('fs');
const {CoinjoinClient} = require('@salad/client');
const {startServer} = require('@salad/operator');
const {expect} = require('chai');
const {utils} = require('enigma-js/node');
const {mineUntilDeal} = require('./test-utils');
const debug = require('debug')('test');
const Web3 = require('web3');
const {Store} = require("@salad/operator");

const SaladContract = require('../build/smart_contracts/Salad.json');
const EnigmaTokenContract = require('../build/enigma_contracts/EnigmaToken.json');
const EnigmaContract = require('../build/enigma_contracts/Enigma.json');
// const EnigmaContract = artifacts.require('Enigma');
const {DEALS_COLLECTION, DEPOSITS_COLLECTION, CACHE_COLLECTION} = require('@salad/operator/src/store');

describe('Salad', () => {
    let server;
    let salad;
    let opts;
    let token;
    let web3Utils;
    let accounts;
    let saladContractAddr;
    let store;
    const threshold = parseInt(process.env.PARTICIPATION_THRESHOLD);
    const provider = new Web3.providers.HttpProvider('http://127.0.0.1:9545');
    const web3 = new Web3(provider);
    before(async () => {
        // console.log('The debug object', debug);
        // debug.enabled = true;
        // debug('Testing log');
        store = new Store();
        await store.initAsync();
        const operatorAccountIndex = 0;
        const scAddr = fs.readFileSync(`${__dirname}/salad.txt`, 'utf-8');
        saladContractAddr = await store.fetchSaladContractAddr();
        await store.closeAsync();

        const enigmaContractAddr = EnigmaContract.networks[process.env.ETH_NETWORK_ID].address;
        const enigmaUrl = `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`;
        server = await startServer(provider, enigmaUrl, saladContractAddr, scAddr, threshold, operatorAccountIndex);

        // Truncating the database
        await server.store.truncate(DEPOSITS_COLLECTION);
        await server.store.truncate(DEALS_COLLECTION);
        await server.store.truncate(CACHE_COLLECTION);

        const operatorUrl = `ws://localhost:${process.env.WS_PORT}`;
        salad = new CoinjoinClient(saladContractAddr, enigmaContractAddr, operatorUrl, provider);
        // Always shutdown the WS server when tests end
        process.on('SIGINT', async () => {
            debug('Caught interrupt signal, shutting down WS server');
            await salad.shutdownAsync();
            await server.shutdownAsync();
            process.exit();
        });
        await salad.initAsync();
        // Convenience shortcuts
        web3Utils = web3.utils;
        accounts = salad.accounts;
        // Default options of client-side transactions
        opts = {
            gas: 4712388,
            gasPrice: 100000000000,
        };
        const tokenAddr = EnigmaTokenContract.networks[process.env.ETH_NETWORK_ID].address;
        token = new web3.eth.Contract(EnigmaTokenContract['abi'], tokenAddr);
    });

    it('should connect to the WS server', async () => {
        debug('Testing connection');
        const action = new Promise((resolve) => {
            salad.ws.once('message', (msg) => {
                const {action} = JSON.parse(msg);
                if (action === 'pong') {
                    resolve(action);
                }
            });
        });
        salad.ws.send(JSON.stringify({action: 'ping', payload: {}}));
        await action;
    });

    let pubKey;
    it('should fetch and cache the encryption pub key', async () => {
        await server.loadEncryptionPubKeyAsync();
        await utils.sleep(300);
        expect(salad.pubKeyData).to.not.be.null;
        expect(salad.keyPair).to.not.be.null;
        pubKey = salad.keyPair.publicKey;
    }).timeout(60000); // Giving more time because fetching the pubKey

    let amount;
    it('should have a valid block countdown', async () => {
        await server.refreshBlocksUntilDeal();
        await utils.sleep(300);
        debug('The block countdown', salad.blockCountdown);
        expect(salad.blockCountdown).to.be.above(0);
        amount = web3Utils.toWei('10');
    });

    async function makeDeposit(depositIndex) {
        let sender;
        let encRecipient;
        let signature;
        debug(`Make deposit ${depositIndex} on Ethereum`);
        sender = salad.accounts[depositIndex];
        const receipt = await salad.makeDepositAsync(sender, amount, opts);
        expect(receipt.status).to.equal(true);

        debug(`Encrypt deposit ${depositIndex}`);
        const recipientIndex = depositIndex + 5;
        const recipient = salad.accounts[recipientIndex];
        debug('The recipient address bytes', web3.utils.hexToBytes(recipient));
        encRecipient = await salad.encryptRecipientAsync(recipient);

        debug(`Sign deposit ${depositIndex} payload`);
        signature = await salad.signDepositMetadataAsync(sender, amount, encRecipient, pubKey);
        debug('The signature', signature);
        const sigBytes = web3Utils.hexToBytes(signature);
        debug('The signature length', sigBytes.length, sigBytes);
        expect(sigBytes.length).to.equal(65);

        debug(`Submit signed deposit ${depositIndex} payload`);
        debug('Testing deposit submit with signature', signature);
        const result = await salad.submitDepositMetadataAsync(sender, amount, encRecipient, pubKey, signature);
        expect(result).to.equal(true);
    }

    async function makeDeposits(nbDeposits) {
        return new Promise((resolve) => {
            for (let i = 0; i < nbDeposits; i++) {
                const depositIndex = i + 1;
                it(`should submit deposit ${depositIndex}`, async () => {
                    await makeDeposit(depositIndex);
                }).timeout(6000);

                it(`should fail to withdraw ${depositIndex} before expiry`, async () => {
                    try {
                        await salad.withdraw(salad.accounts[depositIndex], opts);
                    } catch (e) {
                        expect(e.message).to.include('Deposit not yet available for withdrawal');
                        return;
                    }
                    expect.fail('Withdrawal should not succeed until deposit expiry');
                });
            }

            it('should verify that the submitted deposits are fillable', async () => {
                // Quorum should be N after deposits
                expect(salad.quorum).to.equal(nbDeposits);
                const {deposits} = await salad.fetchFillableDepositsAsync();
                expect(deposits.length).to.equal(nbDeposits);
                resolve(true);
            }).timeout(6000);
        });
    }

    const quorumReached = makeDeposits(threshold);
    let lastDepositBlockNumber;
    let dealPromise;
    let executedDealPromise;
    it('should mine blocks until the deal interval', async () => {
        await quorumReached;
        lastDepositBlockNumber = await web3.eth.getBlockNumber();
        await mineUntilDeal(web3, server);
        // Catching the deal created event
        dealPromise = new Promise((resolve) => {
            salad.onDealCreated((deal) => resolve(deal));
        });
        executedDealPromise = new Promise((resolve) => {
            salad.onDealExecuted((deal) => resolve(deal));
        });
        await server.handleDealExecutionAsync();
    }).timeout(120000); // Give enough time to execute the deal on Enigma

    it('should verify that a deal was created since the threshold is reached', async () => {
        const deal = await dealPromise;
        debug('Created deal', deal);
        const blockNumber = await web3.eth.getBlockNumber();
        debug('The block number after deal creation', blockNumber);
        const deals = await salad.findDealsAsync(1);
        expect(deals.length).to.equal(1);
        // Quorum should be reset to 0 after deal creation
        expect(salad.quorum).to.equal(0);
    });

    it('should verify the deal execution', async () => {
        const {deal} = await executedDealPromise;
        debug('Executed deal', deal);
        const {enigmaContract} = salad;
        const taskRecord = await enigmaContract.methods.getTaskRecord(deal.taskId).call();
        debug('The task record', taskRecord);

        const distributeReceipts = await salad.contract.getPastEvents('Distribute', {
            filter: {},
            fromBlock: lastDepositBlockNumber,
            toBlock: 'latest'
        });
        debug('Distributed event receipts', distributeReceipts);
        expect(distributeReceipts.length).to.equal(1);
        const recipients = [salad.accounts[6], salad.accounts[7], salad.accounts[8]];
        expect(distributeReceipts[0].returnValues._recipients).to.equal(recipients);

        const receipts = await enigmaContract.getPastEvents('ReceiptVerified', {
            filter: {},
            fromBlock: lastDepositBlockNumber,
            toBlock: 'latest'
        });
        debug('Distributed event receipts', receipts);
        expect(receipts.length).to.equal(1);
        const receiptEthContractAddr = receipts[0].returnValues.optionalEthereumContractAddress;
        expect(receiptEthContractAddr).to.equal(saladContractAddr);

        const receiptFailed = await enigmaContract.getPastEvents('ReceiptFailed', {
            filter: {},
            fromBlock: lastDepositBlockNumber,
            toBlock: 'latest'
        });
        debug('Failed receipts', receiptFailed);
        expect(receiptFailed.length).to.equal(0);

        const receiptsFailedEth = await enigmaContract.getPastEvents('ReceiptFailedETH', {
            filter: {},
            fromBlock: lastDepositBlockNumber,
            toBlock: 'latest'
        });
        debug('Failed ETH receipts', receiptsFailedEth);
        expect(receiptsFailedEth.length).to.equal(0);

        const deals = await salad.findDealsAsync(2);
        expect(deals.length).to.equal(1);
        // Quorum should be reset to 0 after deal creation
        expect(salad.quorum).to.equal(0);
        const blockNumber = await web3.eth.getBlockNumber();
        const lastExecutionBlockNumber = await server.dealManager.contract.methods.lastExecutionBlockNumber().call();
        expect(blockNumber).to.equal(parseInt(lastExecutionBlockNumber));
    });

    for (let i = 0; i < threshold; i++) {
        const depositIndex = i + 1;
        it(`should verify that deposit ${depositIndex} balance is 0 (has been distributed)`, async () => {
            const sender = salad.accounts[depositIndex];
            debug('Verifying balance for sender', sender);
            const balance = await server.dealManager.contract.methods.balances(sender).call();
            debug('The balance', balance);
            expect(balance[0]).to.equal('0');
        });
        const recipientIndex = depositIndex + 5;
        it(`should verify recipient ${recipientIndex} balance`, async () => {
            const recipient = salad.accounts[recipientIndex];
            debug('Verifying balance for recipient', recipient);
            const balance = await web3.eth.getBalance(recipient);
            expect(balance).to.equal(amount);
        });
    }

    const nbDepositsQuorumNotReached = threshold - 1;
    const partialQuorumDepositsSubmitted = makeDeposits(nbDepositsQuorumNotReached);
    it('should mine blocks until deal without reaching the quorum', async () => {
        await partialQuorumDepositsSubmitted;
        await mineUntilDeal(web3, server);
        // Catching the quorum not reached event
        const quorumNotReachedPromise = new Promise((resolve) => {
            salad.onQuorumNotReached(() => resolve(true));
        });
        await server.handleDealExecutionAsync();
        expect(await quorumNotReachedPromise).to.equal(true);
    }).timeout(120000); // Give enough time to execute the deal on Enigma

    for (let i = 0; i < nbDepositsQuorumNotReached; i++) {
        const depositIndex = i + 1;
        it(`should withdraw ${depositIndex} after expiry`, async () => {
            const receipt = await salad.withdraw(salad.accounts[depositIndex], opts);
            expect(receipt.status).to.equal(true);
        });
    }
});
