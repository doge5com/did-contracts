// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import { IERC721Upgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';

interface IDIDMintPassUpgradeable is IERC721Upgradeable {
    function mintPassInfos(uint256 tokenId) external returns (string memory name, uint256 strlen);

    function mint(
        address to,
        uint256 tokenId,
        string memory name,
        uint256 strlen
    ) external;
}
