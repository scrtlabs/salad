require('dotenv').config();
const fs = require('fs');
const {CoinjoinClient} = require('enigma-coinjoin-client');
const Web3 = require('web3');
const {startServer} = require('enigma-coinjoin-operator');
const WebSocket = require('ws');
const {expect} = require('chai');
const MixerContract = artifacts.require("Mixer");

const EnigmaTokenContract = require('../build/enigma_contracts/EnigmaToken.json');

contract('Mixer', () => {
    let cjc;
    let opts;
    let token;
    let web3;
    let web3Utils;
    let accounts;
    before(async () => {
        const operatorAccountIndex = 0;
        const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
        const scAddr = fs.readFileSync('../test/mixer.txt', 'utf-8');

        await startServer(provider, scAddr, operatorAccountIndex);

        const contractAddr = this.web3.utils.toChecksumAddress(process.env.CONTRACT_ADDRESS);
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
        web3 = cjc.web3;
        web3Utils = cjc.web3.utils;
        accounts = cjc.accounts;
        // Default options of client-side transactions
        opts = {
            gas: 4712388,
            gasPrice: 100000000000,
        };
        const tokenAddr = EnigmaTokenContract.networks[process.env.ETH_NETWORK_ID].address;
        token = new web3.eth.Contract(EnigmaTokenContract['abi'], tokenAddr);

    });

    // it('should distribute ENG equally to all accounts', async () => {
    //     const operator = accounts[0];
    //     const balance = web3Utils.toBN(await token.methods.balanceOf(operator).call());
    //     console.log('The operator account balance', balance.toString());
    //     const shares = web3Utils.toBN(10);
    //     for (let i = 1; i < accounts.length; i++) {
    //         const recipient = accounts[i];
    //         let recipientBalance = web3Utils.toBN(await token.methods.balanceOf(recipient).call());
    //         if (recipientBalance.gt(web3Utils.toBN(0))) {
    //             console.log('Found balance greater than 0', recipientBalance.toString(), 'aborting distribution');
    //             break;
    //         }
    //         const amount = balance.div(shares);
    //         console.log('Transferring', amount.toString(), 'to', recipient);
    //         await token.methods.approve(recipient, amount.toString()).send({from: operator});
    //         await token.methods.transfer(recipient, amount.toString()).send({from: operator});
    //         recipientBalance = await token.methods.balanceOf(recipient).call();
    //         console.log('The recipient account balance', recipientBalance);
    //     }
    // });

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
    }).timeout(5000);

    it('should verify that the submitted deposit is fillable', async () => {
        const {deposits} = await cjc.fetchFillableDeposits();
        expect(deposits.length).to.equal(1);
    }).timeout(5000);

    it('should make a second deposit on Ethereum', async () => {
        sender = cjc.accounts[2];
        const receipt = await cjc.makeDepositAsync(sender, amount, opts);
        console.log('Made deposit', receipt);
    });

    it('should submit the second encrypted deposit', async () => {
        const recipient = cjc.accounts[7];
        const result = await cjc.submitDepositMetadata(sender, amount, recipient);
        expect(result).to.equal(true);
    }).timeout(5000);

    it('should verify that both submitted deposits are fillable', async () => {
        const {deposits} = await cjc.fetchFillableDeposits();
        expect(deposits.length).to.equal(2);
    }).timeout(5000);

    it('should verify that a deal was created since the threshold is reached', async () => {
        const deals = await cjc.fetchActiveDeals();
    }).timeout(5000);
});