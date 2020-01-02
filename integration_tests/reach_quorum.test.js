require('dotenv').config();
const {CoinjoinClient} = require('@salad/client');
const {startServer} = require('@salad/operator');
const {expect} = require('chai');
const {utils} = require('enigma-js/node');
const {mineUntilDeal, mineBlock} = require('@salad/operator/src/ganacheUtils');
const debug = require('debug')('test');
const Web3 = require('web3');
const {Store, configureWeb3Account} = require("@salad/operator");

const {DEALS_COLLECTION, DEPOSITS_COLLECTION, CACHE_COLLECTION} = require('@salad/operator/src/store');

describe('Salad', () => {
    let salad1;
    let salad2;
    let salad3;
    let opts;
    let web3Utils;
    let balances;
    let sender1;
    let recipient1;
    let sender2;
    let recipient2;
    let sender3;
    let recipient3;

    const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
    const operatorUrl = `ws://${process.env.OPERATOR_HOST}:${process.env.WS_PORT}`;
    const web3 = new Web3(provider);
    web3Utils = web3.utils;

    before(async () => {
        await configureWeb3Account(web3);
        salad1 = new CoinjoinClient(operatorUrl, web3);
        await salad1.initAsync();
        salad2 = new CoinjoinClient(operatorUrl, web3);
        await salad2.initAsync();
        salad3 = new CoinjoinClient(operatorUrl, web3);
        await salad3.initAsync();

    });

    async function makeDeposit(salad, sender, recipient, amount) {

        let encRecipient;
        let signature;

        const receipt = await salad.makeDepositAsync(sender, amount, opts);
        expect(receipt.status).to.equal(true);
        encRecipient = await salad.encryptRecipientAsync(recipient);
        const pubKey = salad.keyPair.publicKey;

        signature = await salad.signDepositMetadataAsync(sender, amount, encRecipient, pubKey);
        const sigBytes = web3Utils.hexToBytes(signature);
        expect(sigBytes.length).to.equal(65);

        const result = await salad.submitDepositMetadataAsync(sender, amount, encRecipient, pubKey, signature);
        expect(result).to.equal(true);
    }

    async function getBalances(symbol) {
        for (let account of [sender1, recipient1, sender2, recipient2, sender3, recipient3]) {
            let accountBalances = balances.get(account);
            if (accountBalances === undefined) {
                accountBalances = new Map();
                balances.set(account, accountBalances);
            }
            accountBalances.set(symbol, await web3.eth.getBalance(account, 'latest'));
        }
    }

    it('should collect balances', async () => {
        // collect balances
        sender1 = salad1.accounts[2];
        recipient1 = salad1.accounts[3];
        sender2 = salad2.accounts[4];
        recipient2 = salad2.accounts[5];
        sender3 = salad3.accounts[7];
        recipient3 = salad3.accounts[6];

        balances = new Map();
        await getBalances('before');
        console.log("the balances of the senders and recipients are: " + JSON.stringify(balances));
    });

    it('make deposit', async () => {
        let amount = web3Utils.toWei("0.01");
        await makeDeposit(salad1, sender1, recipient1, amount);
        await makeDeposit(salad2, sender2, recipient2, amount);
        await makeDeposit(salad3, sender3, recipient3, amount);
    });

    it('should listen for balances to change', async () => {
        do {
            await getBalances('after');
            await utils.sleep(3000);
        } while (
            balances.get(recipient1).get('before') === balances.get(recipient1).get('after')
            || balances.get(recipient2).get('before') === balances.get(recipient2).get('after'))

        let accountDiff = new Map();
        for (let [account, accountBalances] of balances.entries()) {
            accountDiff.set(account, (accountBalances.get('after') - accountBalances.get('before')) / 10**18);
        }
        console.log('The accounts have had their balances changed as follows:');
        console.log(accountDiff);
    });
});
