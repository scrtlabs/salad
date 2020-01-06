require('dotenv').config();
const Web3 = require('web3');
const {mineUntilDeal, mineBlock} = require('./ganacheUtils');

(async () => {

    await mineUntilDeal(web3, server);
});
