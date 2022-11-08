// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '../interfaces/IControllable.sol';

abstract contract ControllableUpgradeable is OwnableUpgradeable, IControllable {
    // A map of addresses that are authorised to register and renew names.
    mapping(address => bool) public controllers;

    modifier onlyController() {
        require(controllers[msg.sender], 'Controllable: Caller is not a controller');
        _;
    }

    function __Controllable_init() internal onlyInitializing {
        __Ownable_init();
    }

    function isController(address controller) public view virtual override returns (bool) {
        return controllers[controller];
    }

    // Authorises a controller, who can register and renew domains.
    function addController(address controller) public virtual override onlyOwner {
        controllers[controller] = true;
        emit ControllerAdded(controller);
    }

    // Revoke controller permission for an address.
    function removeController(address controller) public virtual override onlyOwner {
        controllers[controller] = false;
        emit ControllerRemoved(controller);
    }
}
