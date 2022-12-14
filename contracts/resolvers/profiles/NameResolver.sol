// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../ResolverBase.sol';
import '../../interfaces/profiles/INameResolver.sol';

abstract contract NameResolver is INameResolver, ResolverBase {
    mapping(bytes32 => string) names;

    /**
     * Sets the name associated with an node, for reverse records.
     * May only be called by the owner of that node in the registry.
     * @param node The node to update.
     */
    function setName(bytes32 node, string calldata newName) external virtual authorised(node) {
        names[node] = newName;
        emit NameChanged(node, newName);
    }

    /**
     * Returns the name associated with an node, for reverse records.
     * Defined in EIP181.
     * @param node The node to query.
     * @return The associated name.
     */
    function name(bytes32 node) external view virtual override returns (string memory) {
        return names[node];
    }

    function supportsInterface(bytes4 interfaceID) public view virtual override returns (bool) {
        return interfaceID == type(INameResolver).interfaceId || super.supportsInterface(interfaceID);
    }
}
