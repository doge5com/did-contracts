// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import { AccessControlEnumerableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';

import '../interfaces/IOperatorFilterUpgradeable.sol';

contract BlacklistOperatorFilterUpgradeable is IOperatorFilterUpgradeable, AccessControlEnumerableUpgradeable {
    bytes32 public constant EOA_CODE_HASH = keccak256('');
    bytes32 public constant SET_BLOCKED_ROLE = keccak256('SET_BLOCKED_ROLE');

    mapping(address => bool) public isAddressBlocked;
    mapping(bytes32 => bool) public isCodeHashBlocked;

    function __BlacklistOperatorFilter_init() internal onlyInitializing {
        __BlacklistOperatorFilter_init_unchained();
    }

    function __BlacklistOperatorFilter_init_unchained() internal onlyInitializing {
        _grantRole(SET_BLOCKED_ROLE, _msgSender());
    }

    function filterTransfer(address from) external view returns (bool) {
        return filterApprove(from);
    }

    function filterApprove(address operator) public view returns (bool) {
        return !(isAddressBlocked[operator] || isCodeHashBlocked[operator.codehash]);
    }

    function setAddressBlocked(address operator, bool blocked) external onlyRole(SET_BLOCKED_ROLE) {
        isAddressBlocked[operator] = blocked;
    }

    function setCodeHashBlocked(bytes32 codeHash, bool blocked) external onlyRole(SET_BLOCKED_ROLE) {
        require(codeHash != EOA_CODE_HASH, "can't block EOAs");
        isCodeHashBlocked[codeHash] = blocked;
    }

    function codeHashOf(address operator) external view returns (bytes32) {
        return operator.codehash;
    }
}
