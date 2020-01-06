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

const MIX_AMOUNT = Web3.utils.toWei('0.01');

// all the values passed here must be positive, and the ratio must be in [0,1) or else this is wrong.
function within(ratio_num, ratio_denom, target, value) {
    const high = target.muln(ratio_denom + ratio_num).divn(ratio_denom);
    const low = target.muln(ratio_denom - ratio_num).divn(ratio_denom);
    // console.log([high, diff, low, value].map(x => x.toString() / 1e+18));
    return value.lte(high) && value.gte(low);
}

describe('Salad', () => {
    let salad1;
    let salad2;
    let salad3;
    let opts;
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
        const receipt = await salad.makeDepositAsync(sender, amount, opts);
        expect(receipt.status).to.equal(true);
        const encRecipient = await salad.encryptRecipientAsync(recipient);
        const pubKey = salad.keyPair.publicKey;

        const signature = await salad.signDepositMetadataAsync(sender, amount, encRecipient, pubKey);
        const sigBytes = Web3.utils.hexToBytes(signature);
        expect(sigBytes.length).to.equal(65);

        const result = await salad.submitDepositMetadataAsync(sender, amount, encRecipient, pubKey, signature);
        expect(result).to.equal(true);
    }

    async function getBalances(symbol) {
        for (const account of [sender1, recipient1, sender2, recipient2, sender3, recipient3]) {
            let accountBalances = balances.get(account);
            if (accountBalances === undefined) {
                accountBalances = new Map();
                balances.set(account, accountBalances);
            }
            accountBalances.set(symbol, Web3.utils.toBN(await web3.eth.getBalance(account, 'latest')));
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
        await makeDeposit(salad1, sender1, recipient1, MIX_AMOUNT);
        await makeDeposit(salad2, sender2, recipient2, MIX_AMOUNT);
        await makeDeposit(salad3, sender3, recipient3, MIX_AMOUNT);
    });

    it('should send funds and trigger the DEAL_EXECUTED_UPDATE event', async () => {
        const deal = await new Promise((resolve, reject) => {
            setTimeout(() => resolve(null), 60 * 1000);
            salad1.onDealExecuted(resolve);
        });
        console.log('the deal was:', deal);

        await getBalances('after');
        const accountDiff = new Map();
        for (const [account, accountBalances] of balances.entries()) {
            accountDiff.set(account, accountBalances.get('after').sub(accountBalances.get('before')).toString() / 1e+18);
        }
        console.log('The accounts have had their balances changed as follows:', accountDiff);

        // Expect all recipients to have had their balances increase within a certain proportion of the mix amount.
        expect([recipient1, recipient2, recipient3]
            .map(recipient => balances.get(recipient))
            .every(balance => within(
                15,
                100,
                Web3.utils.toBN('1'+'0'.repeat(16)),
                balance.get('after').sub(balance.get('before')),
            ))
        ).to.equal(true);

    }).timeout(120 * 1000);
});
