// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';

contract DummyMintPass is Ownable, ERC721Enumerable {
    struct MintPassInfo {
        string name; // domain name
        uint256 strlen; // character length
    }
    // tokenId => mintPassInfo
    mapping(uint256 => MintPassInfo) public mintPassInfos;

    string public baseTokenURI;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _baseTokenURI
    ) ERC721(_name, _symbol) {
        baseTokenURI = _baseTokenURI;
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function mint(
        address to,
        uint256 tokenId,
        string memory name,
        uint256 strlen
    ) public onlyOwner {
        _mint(to, tokenId);
        mintPassInfos[tokenId] = MintPassInfo(name, strlen);
    }

    function batchMint(
        address to,
        uint256 tokenId,
        string[] calldata names
    ) public onlyOwner {
        for (uint256 i = 0; i < names.length; i++) {
            _mint(to, tokenId + i);
            mintPassInfos[tokenId + i] = MintPassInfo(names[i], 0);
        }
    }

    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(_msgSender(), tokenId), 'ERC721: caller is not owner nor approved');
        delete mintPassInfos[tokenId];
        _burn(tokenId);
    }

    function setBaseTokenURI(string memory _baseTokenURI) public onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }
}
