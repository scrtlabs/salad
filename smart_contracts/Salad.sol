pragma solidity ^0.5.1;

import "./ISalad.sol";
import {SaladCommon} from "./utils/SaladCommon.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import {Bytes} from "./utils/Bytes.sol";

contract Salad is ISalad {
    using SafeMath for uint256;
    using Bytes for address;
    using Bytes for uint256;

    struct Deal {
        address organizer;
        mapping(address => uint) deposit;

        uint startTime;
        uint depositInWei;
        uint numParticipants;
        address[] recipients;
        DealStatus status;
    }
    enum DealStatus { Undefined, Executable, Executed, Cancelled }

    struct Balance {
        uint amount;
        uint lastDepositBlockNumber;
    }

    mapping(bytes32 => Deal) public deals;
    mapping(address => Balance) public balances;
    bytes32[] public dealIds;
    uint public depositLockPeriodInBlocks;
    uint public dealIntervalInBlocks;
    uint public relayerFeePercent;
    uint public participationThreshold;
    uint public lastExecutionBlockNumber;

    event NewDeal(address indexed user, bytes32 indexed _dealId, uint _startTime, uint _depositInWei, uint _numParticipants, bool _success, string _err);
    event Deposit(address indexed _depositor, uint _value, uint _balance);
    event Withdraw(address indexed _depositor, uint _value);
    event Distribute(bytes32 indexed _dealId, uint individualAmountInWei, uint32 nbTransfers);

    modifier onlyEnigma {
        // TODO: Verify the calling fn in addition to the Enigma contract address
        // require(msg.sender == owner, "Only owner can call this function.");
        _;
    }

    constructor(uint _depositLockPeriodInBlocks, uint _dealIntervalInBlocks, uint _relayerFeePercent, uint _participationThreshold) public {
        depositLockPeriodInBlocks = _depositLockPeriodInBlocks;
        dealIntervalInBlocks = _dealIntervalInBlocks;
        relayerFeePercent = _relayerFeePercent;
        participationThreshold = _participationThreshold;
    }

    /**
    * Create a new Pending Deal
    *
    * @param _amountInWei The required deposit amount (in Wei)
    * @param _participants The sender addresses of Deal participants
    * @param _nonce The nonce (operator's transaction count)
    */
    function newDeal(uint _amountInWei, address[] memory _participants, uint _nonce)
    public {
        uint newDealBlockNumber = lastExecutionBlockNumber.add(dealIntervalInBlocks);
        require(newDealBlockNumber < block.number, "Deal creation interval not reached");
        for (uint i = 0; i < _participants.length; i++) {
            require(balances[_participants[i]].amount >= _amountInWei, "Participant balance(s) insufficient");
        }
        // TODO: Verify balances
        bytes32 _dealId = generateDealId(_amountInWei, _participants, _nonce);
        dealIds.push(_dealId);
        deals[_dealId].organizer = msg.sender;
        deals[_dealId].startTime = now;
        deals[_dealId].depositInWei = _amountInWei;
        deals[_dealId].numParticipants = _participants.length;
        deals[_dealId].recipients = new address[](_participants.length);
        deals[_dealId].status = DealStatus.Executable;
        emit NewDeal(msg.sender, _dealId, now, _amountInWei, _participants.length, true, "all good");
    }

    /**
    * Make deposit to own balance for participation in Deals
    */
    function makeDeposit()
    public
    payable {
        require(msg.value > 0, "Deposit value must be positive.");
        balances[msg.sender].amount = balances[msg.sender].amount.add(msg.value);
        balances[msg.sender].lastDepositBlockNumber = block.number;
        emit Deposit(msg.sender, msg.value, balances[msg.sender].amount);
    }

    /**
    * Withdraw from own balance
    */
    function withdraw()
    public
    payable {
        uint withdrawBlockNumber = balances[msg.sender].lastDepositBlockNumber.add(depositLockPeriodInBlocks);
        require(withdrawBlockNumber < block.number, "Deposit not yet available for withdrawal");
        uint amount = balances[msg.sender].amount;
        msg.sender.transfer(amount);
        balances[msg.sender].amount = 0;
        emit Withdraw(msg.sender, amount);
    }

    /**
    * Get own balance (in Wei)
    *
    * @param _account The participant address
    */
    function getParticipantBalance(address _account) public view returns (uint) {
        return balances[_account].amount;
    }

    function _generateDealIdMessage(uint _amountInWei, address[] memory _participants, uint _nonce)
    public
    returns (bytes memory) {
        bytes memory _message;
        _message = SaladCommon.appendMessage(_message, _amountInWei.toBytes());
        _message = SaladCommon.appendMessageArrayLength(_participants.length, _message);
        for (uint i = 0; i < _participants.length; i++) {
            _message = SaladCommon.appendMessage(_message, _participants[i].toBytes());
        }
        address _sender = msg.sender;
        _message = SaladCommon.appendMessage(_message, _sender.toBytes());
        _message = SaladCommon.appendMessage(_message, _nonce.toBytes());
        return _message;
    }


    /**
    * Generate a DealId
    * H(Amount, Sender Addresses, Relayer Ethereum Address, Relayer Ethereum Nonce)
    *
    * @param _amountInWei The required deposit amount (in Wei)
    * @param _participants The sender addresses of Deal participants
    * @param _nonce The nonce (operator's transaction count)
    */
    function generateDealId(uint _amountInWei, address[] memory _participants, uint _nonce)
    public
    returns (bytes32) {
        bytes memory _message = _generateDealIdMessage(_amountInWei, _participants, _nonce);
        //bytes memory _message = "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000008ac7230489e8000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000014ffcf8fdee72ac11b5c542428b35eef5769c409f0000000000000000000000000000000000000000000000000000000000000001422d491bde2303f2f43325b2108d26f1eaba1e32b0000000000000000000000000000000000000000000000000000000000000014ca35b7d915458ef540ade6068dfe2f44e8fa733c00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001";
        bytes32 _dealId = keccak256(_message);
        return _dealId;
    }

    /**
    * Distribute funds by executing Deal.
    * Callable only by the Salad secret contract
    *
    * @param _dealId The DealId, a unique identifier and fingerprint for the Deal parameters
    * @param _recipients The shuffled recipient addresses
    */
    function distribute(uint256 _dealId, address payable[] memory _recipients)
    public
    onlyEnigma() {
        // Distribute the deposits to destination addresses
        // TODO: This conversion is only necessary because of an Enigma callback bug with bytes32
        bytes32 dealId = bytes32(_dealId);
        require(deals[dealId].status != DealStatus.Executable, "Deal is not executable.");
        deals[dealId].recipients = _recipients;
        for (uint i = 0; i < _recipients.length; i++) {
            _recipients[i].transfer(deals[dealId].depositInWei);
        }
        deals[dealId].status = DealStatus.Executed;
        lastExecutionBlockNumber = block.number;
        emit Distribute(dealId, deals[dealId].depositInWei, uint32(_recipients.length));
    }

    /**
    * Query Deals by status code
    *
    * @param _status The deal status code
    */
    function listDeals(uint8 _status)
    public
    view
    returns (bytes32[] memory, address[] memory, uint[] memory, uint[] memory, uint8[] memory) {
        // A list of deals with their key properties
        bytes32[] memory dealId = new bytes32[](dealIds.length);
        address[] memory organizer = new address[](dealIds.length);
        uint[] memory depositInWei = new uint[](dealIds.length);
        uint[] memory numParticipants = new uint[](dealIds.length);
        uint8[] memory status = new uint8[](dealIds.length);
        for (uint i = 0; i < dealIds.length; i++) {
            bytes32 _dealId = dealIds[i];
            dealId[i] = _dealId;
            organizer[i] = deals[_dealId].organizer;
            depositInWei[i] = deals[_dealId].depositInWei;
            numParticipants[i] = deals[_dealId].numParticipants;
            status[i] = uint8(deals[_dealId].status);
        }
        return (dealId, organizer, depositInWei, numParticipants, status);
    }

    /**
    * Get key attributes of the deal
    *
    * @param _dealId The deal Id
    */
    function dealStatus(bytes32 _dealId)
    public
    view
    returns (uint, uint, uint) {
        // TODO: Include status code
        // Key attributes of a deal
        uint numParticipants = deals[_dealId].numParticipants;
        uint deposit = deals[_dealId].depositInWei;
        uint numDestAddresses = deals[_dealId].recipients.length;

        return (numParticipants, deposit, numDestAddresses);
    }
}
