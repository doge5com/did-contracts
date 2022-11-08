// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../interfaces/IRegistry.sol';

/**
 * A registrar that allocates subdomains to the first person to claim them, but
 * expires registrations a fixed period after they're initially claimed.
 */
contract TestRegistrar {
    uint256 constant registrationPeriod = 4 weeks;

    IRegistry public immutable registry;
    bytes32 public immutable rootNode;
    mapping(bytes32 => uint256) public expiryTimes;

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
     * Register a name that's not currently registered
     * @param label The hash of the label to register.
     * @param owner The address of the new owner.
     */
    function register(bytes32 label, address owner) public {
        require(expiryTimes[label] < block.timestamp);

        expiryTimes[label] = block.timestamp + registrationPeriod;
        registry.setSubnodeOwner(rootNode, label, owner);
    }
}
