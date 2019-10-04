pragma solidity >=0.4.0 <0.6.0;
import "remix_tests.sol"; // this import is automatically injected by Remix.
import "../smart_contracts/Salad.sol";

// file name has to end with '_test.sol'
contract Mixer_test {
    Salad salad;
    address[] participants;

    function beforeAll() public {
        salad = new Mixer();
    }
    

    function checkGenerareDealId() public {
        participants.push(0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0);
        participants.push(0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b);
        bytes32 dealId = salad.generateDealId(10000000000000000000, participants, 1);
        bytes32 expectedDealid = 0x880548fd317bdf4eeeddc8b3550af81cefee862f03051307eb3f569576c1abec;
        // use 'Assert' to test the contract
        Assert.equal(dealId, expectedDealid, "Mismatching DealId");
    }
}

