//generateDealId( 10000000000000000000 [ '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
//   '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b' ]
const MixerContract = artifacts.require("Mixer");
const {CoinjoinClient} = require('enigma-coinjoin-client');

contract('Mixer', () => {
    it('should generate a matching DealId', async () => {
        const dealId = CoinjoinClient.generateDealId(
            web3,
            '10000000000000000000',
            ["0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0", "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b"],
            '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c',
            '1'
        );
        console.log('The generated DealId', dealId);
    });
});
