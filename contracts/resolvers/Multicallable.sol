// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import '../interfaces/IMulticallable.sol';

abstract contract Multicallable is IMulticallable, ERC165 {
    function multicall(bytes[] calldata data) external override returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).call(data[i]);
            require(success);
            results[i] = result;
        }
        return results;
    }

    function multicall2(
        bytes32 node,
        address wallet,
        string[] calldata keys,
        string[] calldata values
    ) external {
        require(keys.length == values.length, 'Multicallable: records length not match');

        for (uint256 i = 0; i < keys.length; i++) {
            (bool success, bytes memory data) = address(this).call(
                abi.encodeWithSignature('setText(bytes32,string,string)', node, keys[i], values[i])
            );
            require(success, string(data));
        }
        if (wallet != address(0)) {
            (bool success, bytes memory data) = address(this).call(
                abi.encodeWithSignature('setAddr(bytes32,address)', node, wallet)
            );
            require(success, string(data));
        }
    }

    function supportsInterface(bytes4 interfaceID) public view virtual override returns (bool) {
        return interfaceID == type(IMulticallable).interfaceId || super.supportsInterface(interfaceID);
    }
}
