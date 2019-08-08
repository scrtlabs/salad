pragma solidity ^0.5.1;

import "./IMixer.sol";

contract Mixer is IMixer {
    struct Deal {
        address organizer;
        mapping(address => uint) deposit;

        uint startTime;
        uint depositInWei;
        uint numParticipants;
        address[] recipients;
        uint status; // 0: active; 1: funded; 2: executed; 3: cancelled
    }

    mapping(bytes32 => Deal) deals;
    mapping(address => uint) balances;
    bytes32[] dealIds;

    event NewDeal(address indexed user, bytes32 indexed _dealId, uint _startTime, uint _depositInWei, uint _numParticipants, bool _success, string _err);
    event Deposit(address indexed _depositor, uint _value, uint _balance, bool _success, string _err);
    event Distribute(bytes32 indexed _dealId, uint individualAmountInWei, uint32 nbTransfers, bool _success, string _err);

    event TransferredToken(address indexed to, uint256 value);
    event FailedTransfer(address indexed to, uint256 value);

    event DealFullyFunded(bytes32 indexed _dealId);
    event DealExecuted(bytes32 indexed _dealId, bool _success);


    modifier onlyEnigma {
        // require(msg.sender == owner, "Only owner can call this function.");
        _;
    }

    function newDeal(bytes32 _dealId, uint _depositInWei, address[] memory _participants)
    public {
        // TODO: Verify balances
        dealIds.push(_dealId);
        deals[_dealId].organizer = msg.sender;
        deals[_dealId].startTime = now;
        deals[_dealId].depositInWei = _depositInWei;
        deals[_dealId].numParticipants = _participants.length;
        deals[_dealId].recipients = new address[](_participants.length);
        deals[_dealId].status = 0;
        emit NewDeal(msg.sender, _dealId, now, _depositInWei, _participants.length, true, "all good");
    }

    function makeDeposit()
    public
    payable {
        require(msg.value > 0, "Deposit value must be positive.");
        // TODO: use safeMath
        balances[msg.sender] = balances[msg.sender] + msg.value;
        emit Deposit(msg.sender, msg.value, balances[msg.sender], true, "all good");
    }

    function getParticipantBalance(address _account) public view returns (uint) {
        return balances[_account];
    }

    function distribute(uint256 _dealId, address payable[] memory _recipients)
    public
    onlyEnigma() {
        // Distribute the deposits to destination addresses
        bytes32 dealId = bytes32(_dealId);
        require(deals[dealId].status == 1, "Deal is not executed.");
        deals[dealId].recipients = _recipients;

        for (uint i = 0; i < _recipients.length; i++) {
            _recipients[i].transfer(deals[dealId].depositInWei);
        }

        emit Distribute(dealId, deals[dealId].depositInWei, uint32(_recipients.length), true, "all good");
    }

    function listDeals()
    public
    view
    returns (uint[] memory, uint[] memory, uint[] memory) {
        // A list of deals with their key properties
        uint[] memory status = new uint[](dealIds.length);
        uint[] memory participates = new uint[](dealIds.length);
        uint[] memory organizes = new uint[](dealIds.length);

        for (uint i = 0; i < dealIds.length; i++) {
            bytes32 dealId = dealIds[i];
            status[i] = deals[dealId].status;

            if (deals[dealId].deposit[msg.sender] > 0) {
                participates[i] = 1;
            }

            if (deals[dealId].organizer == msg.sender) {
                organizes[i] = 1;
            }
        }
        return (status, participates, organizes);
    }

    function dealStatus(bytes32 _dealId)
    public
    view
    returns (uint, uint, uint) {
        // Key attributes of a deal
        uint numParticipants = deals[_dealId].numParticipants;
        uint deposit = deals[_dealId].depositInWei;
        uint numDestAddresses = deals[_dealId].recipients.length;

        return (numParticipants, deposit, numDestAddresses);
    }
}
