// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import { AccessControlEnumerableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';

abstract contract PauserRolePausableUpgradeable is AccessControlEnumerableUpgradeable, PausableUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256('PAUSER_ROLE');
    bytes32 public constant UNPAUSER_ROLE = keccak256('UNPAUSER_ROLE');

    function __PauserRolePausable_init() internal onlyInitializing {
        __PauserRolePausable_init_unchained();
    }

    function __PauserRolePausable_init_unchained() internal onlyInitializing {
        _grantRole(PAUSER_ROLE, _msgSender());
        _grantRole(UNPAUSER_ROLE, _msgSender());
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        PausableUpgradeable._pause();
    }

    function unpause() public onlyRole(UNPAUSER_ROLE) {
        PausableUpgradeable._unpause();
    }
}
