pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import { Bytes } from "./Bytes.sol";

/**
 * @author Salad
 *
 * This library contains the common structs and enums used throughout the Salad codebase
 */
library SaladCommon {
    using Bytes for bytes;
    using Bytes for uint64;

    /**
    * Append the length of a variable and the variable to an existing bytes buffer
    *
    * @param _message Bytes buffer being appended to
    * @param _var Bytes representation of value that needs to be concatenated to existing buffer
    * @return New bytes buffer
    */
    function appendMessage(bytes memory _message, bytes memory _var)
    internal
    pure
    returns (bytes memory)
    {
        return (_message.concat(uint64(_var.length).toBytesFromUint64())).concat(_var);
    }

    /**
    * Append the length of an array to an existing bytes buffer
    *
    * @param _message Bytes buffer being appended to
    * @param _arraylength Length of array
    * @return New bytes buffer
    */
    function appendMessageArrayLength(uint256 _arraylength, bytes memory _message)
    internal
    pure
    returns (bytes memory)
    {
        return _message.concat(uint64(_arraylength).toBytesFromUint64());
    }
}