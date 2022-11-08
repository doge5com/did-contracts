// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

interface IDIDMintPass is IERC721 {
    function mintPassInfos(uint256 tokenId) external returns (string memory name, uint256 strlen);

    function mint(
        address to,
        uint256 tokenId,
        string memory name,
        uint256 strlen
    ) external;
}
