require('dotenv').config();
const {CoinjoinClient} = require('@salad/client');
const {startServer} = require('@salad/operator');
const {expect} = require('chai');
const {utils} = require('enigma-js/node');
const {mineUntilDeal, mineBlock} = require('@salad/operator/src/ganacheUtils');
const debug = require('debug')('test');
const Web3 = require('web3');
const {Store} = require("@salad/operator");

const {DEALS_COLLECTION, DEPOSITS_COLLECTION, CACHE_COLLECTION} = require('@salad/operator/src/store');

describe('Salad', () => {
    let salad;
    let opts;
    let web3Utils;
    let accounts;

    // const threshold = parseInt(process.env.PARTICIPATION_THRESHOLD);
    // const anonSetSize = threshold;
    const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
    const operatorUrl = `ws://${process.env.OPERATOR_HOST}:${process.env.WS_PORT}`;
    const web3 = new Web3(provider);

    before(async () => {
        salad = new CoinjoinClient(operatorUrl, web3);
        await salad.initAsync();

        process.on('SIGINT', async () => {
            await salad.shutdownAsync();
            process.exit();
        });
    });

    it('should uhhh', async () => {
        console.log(JSON.stringify(salad.pubKeyData));
        console.log(JSON.stringify(salad.keyPair));
    });
});
