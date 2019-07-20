pragma solidity ^0.5.1;

interface IMixer {
    function newDeal(bytes32 _title, uint _depositInWei, uint _numParticipants) external;
    function makeDeposit(bytes32 dealId, bytes32 recipientHash) external payable;
    function distribute(bytes32 dealId, address payable[] calldata recipients) external;
    function dealStatus(bytes32 _dealId) external view returns (bytes32, uint, uint, uint, uint, uint);
    function countEncryptedAddresses(bytes32 _dealId) external view returns (uint) ;
    function getRecipientHash(bytes32 _dealId, uint index) external view returns (bytes32);
    function listDeals() external view returns (uint[] memory, uint[] memory, uint[] memory);
}
