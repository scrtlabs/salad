pragma solidity ^0.5.1;

import "./IMixer.sol";

contract Mixer is IMixer {
    struct Deal {
        address organizer;
        string title;
        mapping(address => uint) deposit;
        uint depositSum;
        uint numDeposits;

        uint startTime;
        uint depositInWei;
        uint numParticipants;

        bytes32[] recipientHashes;
        address[] recipients;

        uint status; // 0: active; 1: funded; 2: executed; 3: cancelled
    }

    mapping(bytes32 => Deal) deals;
    bytes32[] dealIds;

    event NewDeal(address indexed user, bytes32 indexed _dealId, uint _startTime, string _title, uint _depositInWei, uint _numParticipants, bool _success, string _err);
    event Deposit(address indexed _depositor, bytes32 indexed _dealId, bytes32 _recipientHash, uint _value, bool _success, string _err);
    event Distribute(bytes32 indexed _dealId, uint individualAmountInWei, uint32 nbTransfers, bool _success, string _err);

    event TransferredToken(address indexed to, uint256 value);
    event FailedTransfer(address indexed to, uint256 value);

    event DealFullyFunded(bytes32 indexed _dealId);
    event DealExecuted(bytes32 indexed _dealId, bool _success);


    modifier onlyEnigma {
        // require(msg.sender == owner, "Only owner can call this function.");
        _;
    }

    function newDeal(string memory _title, uint _depositInWei, uint _numParticipants)
    public {
        bytes32 dealId = bytes32(dealIds.length);

        dealIds.push(dealId);
        deals[dealId].organizer = msg.sender;
        deals[dealId].title = _title;
        deals[dealId].depositSum = 0;
        deals[dealId].numDeposits = 0;
        deals[dealId].startTime = now;
        deals[dealId].depositInWei = _depositInWei;
        deals[dealId].numParticipants = _numParticipants;
        deals[dealId].recipientHashes = new bytes32[](_numParticipants);
        deals[dealId].recipients = new address[](_numParticipants);
        deals[dealId].status = 0;
        emit NewDeal(msg.sender, dealId, now, _title, _depositInWei, _numParticipants, true, "all good");
    }

    function makeDeposit(bytes32 dealId, bytes32 recipientHash)
    public
    payable {
        require(msg.value > 0, "Deposit value must be positive.");
        require(deals[dealId].status == 0, "Illegal state for deposits.");

        Deal storage deal = deals[dealId];
        require((msg.value % deal.depositInWei) == 0, "Deposit value must be a multiple of claim value");
        require(deal.deposit[msg.sender] == 0, "Cannot deposit twice with the same address");

        // actual deposit
        deal.depositSum += msg.value;
        deal.deposit[msg.sender] = msg.value;
        deal.recipientHashes[deal.numDeposits] = recipientHash;
        deal.numDeposits += 1;

        emit Deposit(msg.sender, dealId, recipientHash, msg.value, true, "all good");

        if (deal.numDeposits >= deal.numParticipants) {
            deal.status = 1;
            emit DealFullyFunded(dealId);
        }
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
    returns (string memory, uint, uint, uint, uint, uint) {
        // Key attributes of a deal
        string memory title = deals[_dealId].title;
        uint numParticipants = deals[_dealId].numParticipants;
        uint deposit = deals[_dealId].depositInWei;
        uint numDeposits = deals[_dealId].numDeposits;
        uint depositSum = deals[_dealId].depositSum;
        uint numDestAddresses = deals[_dealId].recipients.length;

        return (title, numParticipants, deposit, numDeposits, depositSum, numDestAddresses);
    }

    function countEncryptedAddresses(bytes32 _dealId)
    public
    view
    returns (uint) {
        // Count the addresses
        return deals[_dealId].recipientHashes.length;
    }

    function getRecipientHash(bytes32 _dealId, uint index)
    public
    view
    returns (bytes32) {
        // Returns an array of encrypted addresses
        return deals[_dealId].recipientHashes[index];
    }
}
