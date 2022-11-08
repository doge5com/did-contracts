// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../ResolverBase.sol';
import '../../interfaces/profiles/IAddrResolver.sol';

abstract contract AddrResolver is IAddrResolver, ResolverBase {
    uint256 private constant COIN_TYPE_ETH = 60;

    mapping(bytes32 => mapping(uint256 => bytes)) _addresses;

    /**
     * Sets the address associated with an node.
     * May only be called by the owner of that node in the registry.
     * @param node The node to update.
     * @param a The address to set.
     */
    function setAddr(bytes32 node, address a) external virtual authorised(node) {
        setAddrWithCoinType(node, COIN_TYPE_ETH, addressToBytes(a));
    }

    function setAddrWithCoinType(
        bytes32 node,
        uint256 coinType,
        bytes memory a
    ) public virtual authorised(node) {
        _addresses[node][coinType] = a;
        emit AddressChanged(node, coinType, a);
    }

    /**
     * Returns the address associated with an node.
     * @param node The node to query.
     * @return The associated address.
     */
    function addr(bytes32 node) public view virtual override returns (address payable) {
        bytes memory a = addrWithCoinType(node, COIN_TYPE_ETH);
        if (a.length == 0) {
            return payable(0);
        }
        return bytesToAddress(a);
    }

    function addrWithCoinType(bytes32 node, uint256 coinType) public view virtual override returns (bytes memory) {
        return _addresses[node][coinType];
    }

    function supportsInterface(bytes4 interfaceID) public view virtual override returns (bool) {
        return interfaceID == type(IAddrResolver).interfaceId || super.supportsInterface(interfaceID);
    }

    function bytesToAddress(bytes memory b) internal pure returns (address payable a) {
        require(b.length == 20, 'AddrResolver: invalid address length');
        assembly {
            a := div(mload(add(b, 32)), exp(256, 12))
        }
    }

    function addressToBytes(address a) internal pure returns (bytes memory b) {
        b = new bytes(20);
        assembly {
            mstore(add(b, 32), mul(a, exp(256, 12)))
        }
    }
}
