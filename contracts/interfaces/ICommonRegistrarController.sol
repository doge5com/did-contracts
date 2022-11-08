// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import './IRegistrarController.sol';

interface ICommonRegistrarController is IRegistrarController {
    function makeCommitment(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data
    ) external returns (bytes32);

    function commit(bytes32) external;

    function register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        address registrar
    ) external payable;
}
