pragma solidity ^0.5.1;

interface IMixer {
    function distribute(uint256 _dealId, address payable[] calldata _recipients) external;
}
