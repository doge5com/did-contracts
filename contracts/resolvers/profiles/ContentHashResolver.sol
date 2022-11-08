// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../ResolverBase.sol';
import '../../interfaces/profiles/IContentHashResolver.sol';

abstract contract ContentHashResolver is IContentHashResolver, ResolverBase {
    mapping(bytes32 => bytes) hashes;

    /**
     * Sets the contenthash associated with an node.
     * May only be called by the owner of that node in the registry.
     * @param node The node to update.
     * @param hash The contenthash to set
     */
    function setContenthash(bytes32 node, bytes calldata hash) external virtual authorised(node) {
        hashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    /**
     * Returns the contenthash associated with an node.
     * @param node The node to query.
     * @return The associated contenthash.
     */
    function contenthash(bytes32 node) external view virtual override returns (bytes memory) {
        return hashes[node];
    }

    function supportsInterface(bytes4 interfaceID) public view virtual override returns (bool) {
        return interfaceID == type(IContentHashResolver).interfaceId || super.supportsInterface(interfaceID);
    }
}
