// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

interface IExtendedResolver {
    function resolve(bytes memory name, bytes memory data) external view returns (bytes memory, address);
}
