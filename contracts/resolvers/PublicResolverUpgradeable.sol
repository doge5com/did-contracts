// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../controllers/ControllableUpgradeable.sol';
import '../interfaces/IRegistry.sol';
import './profiles/ABIResolver.sol';
import './profiles/AddrResolver.sol';
import './profiles/ContentHashResolver.sol';
import './profiles/InterfaceResolver.sol';
import './profiles/NameResolver.sol';
import './profiles/PubkeyResolver.sol';
import './profiles/TextResolver.sol';
import './Multicallable.sol';

/**
 * A simple resolver anyone can use; only allows the owner of a node to set its
 * address.
 */
contract PublicResolverUpgradeable is
    ControllableUpgradeable,
    Multicallable,
    ABIResolver,
    AddrResolver,
    ContentHashResolver,
    InterfaceResolver,
    NameResolver,
    PubkeyResolver,
    TextResolver
{
    IRegistry public registry;
    address public reverseRegistrar;

    /**
     * A mapping of operators. An address that is authorised for an address
     * may make any changes to the name that the owner could, but may not update
     * the set of authorisations.
     * (owner, operator) => approved
     */
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Logged when an operator is added or removed.
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function initialize(IRegistry _registry, address _reverseRegistrar) public initializer {
        __Controllable_init();

        registry = _registry;
        reverseRegistrar = _reverseRegistrar;
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(msg.sender != operator, 'PublicResolver: setting approval status for self');

        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function isAuthorised(bytes32 node) internal view override returns (bool) {
        address from = msg.sender;
        if (from == address(this)) {
            from = tx.origin;
        }
        if (isController(from) || msg.sender == reverseRegistrar) {
            return true;
        }
        address owner = registry.owner(node);
        return owner == from || isApprovedForAll(owner, from);
    }

    function supportsInterface(bytes4 interfaceID)
        public
        view
        override(
            Multicallable,
            ABIResolver,
            AddrResolver,
            ContentHashResolver,
            InterfaceResolver,
            NameResolver,
            PubkeyResolver,
            TextResolver
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceID);
    }
}
