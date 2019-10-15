const SaladContract = artifacts.require('Salad');
const {CoinjoinClient} = require('enigma-coinjoin-client');

contract('Salad', (accounts) => {
    it.skip('should generate a matching DealId message', async () => {
        const amount = '10000000000000000000';
        const participants = ["0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0", "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b"];
        const operator = accounts[0];
        const nonce = await web3.eth.getTransactionCount(operator);
        const messageBytes = CoinjoinClient.generateDealIdMessage(
            web3,
            amount,
            participants,
            operator,
            nonce,
        );
        console.log('The generated DealId message bytes', messageBytes);
        const message = web3.utils.bytesToHex(messageBytes);
        console.log('Message 1:', message);
        const instance = await SaladContract.deployed();
        const contractMessage = await instance._generateDealIdMessage.call(amount, participants, nonce);
        console.log('Message 2:', contractMessage);
        expect(contractMessage).to.equal(message);
    });
});
