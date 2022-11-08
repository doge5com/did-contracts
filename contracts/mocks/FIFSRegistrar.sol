// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../interfaces/IRegistry.sol';

/**
 * A registrar that allocates subdomains to the first person to claim them.
 */
contract FIFSRegistrar {
    IRegistry registry;
    bytes32 rootNode;

    modifier only_owner(bytes32 label) {
        address currentOwner = registry.owner(keccak256(abi.encodePacked(rootNode, label)));
        require(currentOwner == address(0x0) || currentOwner == msg.sender);
        _;
    }

    /**
     * Constructor.
     * @param registryAddr The address of the registry.
     * @param node The node that this registrar administers.
     */
    constructor(IRegistry registryAddr, bytes32 node) {
        registry = registryAddr;
        rootNode = node;
    }

    /**
     * Register a name, or change the owner of an existing registration.
     * @param label The hash of the label to register.
     * @param owner The address of the new owner.
     */
    function register(bytes32 label, address owner) public only_owner(label) {
        registry.setSubnodeOwner(rootNode, label, owner);
    }
}
