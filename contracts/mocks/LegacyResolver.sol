// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

contract LegacyResolver {
    function addr(
        bytes32 /* node */
    ) public view returns (address) {
        return address(this);
    }
}
