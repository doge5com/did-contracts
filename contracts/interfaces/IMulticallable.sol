// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

interface IMulticallable {
    function multicall(bytes[] calldata data) external returns (bytes[] memory results);
}
