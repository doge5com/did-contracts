// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

import { AddressUpgradeable, IERC20Upgradeable, SafeERC20Upgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import { IERC721Upgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';
import { AccessControlEnumerableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';

abstract contract WithdrawerRoleTokenWithdrawUpgradeable is AccessControlEnumerableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant WITHDRAWER_ROLE = keccak256('WITHDRAWER_ROLE');

    function __WithdrawerRoleTokenWithdraw_init() internal onlyInitializing {
        __WithdrawerRoleTokenWithdraw_init_unchained();
    }

    function __WithdrawerRoleTokenWithdraw_init_unchained() internal onlyInitializing {
        _grantRole(WITHDRAWER_ROLE, _msgSender());
    }

    function withdraw(address payable receiver, uint256 amount) external onlyRole(WITHDRAWER_ROLE) {
        AddressUpgradeable.sendValue(receiver, amount);
    }

    function withdrawERC20(
        address tokenAddress,
        address receiver,
        uint256 amount
    ) external onlyRole(WITHDRAWER_ROLE) {
        IERC20Upgradeable(tokenAddress).transfer(receiver, amount);
    }

    function withdrawERC721(
        address tokenAddress,
        address receiver,
        uint256[] memory tokenIds
    ) external onlyRole(WITHDRAWER_ROLE) {
        for (uint256 i; i < tokenIds.length; ++i) {
            IERC721Upgradeable(tokenAddress).transferFrom(address(this), receiver, tokenIds[i]);
        }
    }
}
