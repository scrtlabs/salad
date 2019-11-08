require('dotenv').config();
const Web3 = require('web3');
const {mineUntilDeal, mineBlock} = require('./ganacheUtils');

const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);
(async () => {

    await mineUntilDeal(web3, server);
});
