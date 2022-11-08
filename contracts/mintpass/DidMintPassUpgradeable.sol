// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

import { IERC165Upgradeable, ERC721Upgradeable, ERC721EnumerableUpgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol';
import { ERC721PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol';
import { ERC721RoyaltyUpgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721RoyaltyUpgradeable.sol';
import { ERC1967UpgradeUpgradeable, UUPSUpgradeable } from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

import { UriRoleBaseTokenURIUpgradeable, AccessControlEnumerableUpgradeable } from '../utils/UriRoleBaseTokenURIUpgradeable.sol';
import { WithdrawerRoleTokenWithdrawUpgradeable } from '../utils/WithdrawerRoleTokenWithdrawUpgradeable.sol';
import { PauserRolePausableUpgradeable } from '../utils/PauserRolePausableUpgradeable.sol';
import { IDIDMintPassUpgradeable } from '../interfaces/IDIDMintPassUpgradeable.sol';
import { ERC721FilteringOperatorUpgradeable } from '../utils/ERC721FilteringOperatorUpgradeable.sol';

contract DidMintPassUpgradeable is
    UUPSUpgradeable,
    IDIDMintPassUpgradeable,
    PauserRolePausableUpgradeable,
    WithdrawerRoleTokenWithdrawUpgradeable,
    UriRoleBaseTokenURIUpgradeable,
    ERC721FilteringOperatorUpgradeable,
    ERC721EnumerableUpgradeable,
    ERC721PausableUpgradeable,
    ERC721RoyaltyUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
    bytes32 public constant BURNER_ROLE = keccak256('BURNER_ROLE');
    bytes32 public constant ROYALTY_ROLE = keccak256('ROYALTY_ROLE');
    bytes32 public constant UPGRADE_ROLE = keccak256('UPGRADE_ROLE');

    struct MintPassInfo {
        string name; // domain name
        uint256 strlen; // character length
    }
    // tokenId => mintPassInfo
    mapping(uint256 => MintPassInfo) public mintPassInfos;

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory baseTokenURI_
    ) external virtual initializer {
        __ERC1967Upgrade_init_unchained();
        __UUPSUpgradeable_init_unchained();

        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __AccessControlEnumerable_init_unchained();
        __Pausable_init_unchained();
        __PauserRolePausable_init_unchained();
        __WithdrawerRoleTokenWithdraw_init_unchained();
        __UriRoleBaseTokenURI_init_unchained(baseTokenURI_);

        __ERC721_init_unchained(name_, symbol_);
        __ERC721Enumerable_init_unchained();
        __ERC721Pausable_init_unchained();
        __ERC2981_init_unchained();
        __ERC721Royalty_init_unchained();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADE_ROLE) {}

    function exists(uint256 tokenId) external view returns (bool) {
        return _exists(tokenId);
    }

    function mint(
        address to,
        uint256 tokenId,
        string memory name,
        uint256 strlen
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, tokenId);
        mintPassInfos[tokenId] = MintPassInfo(name, strlen);
    }

    function burn(uint256 tokenId) external {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId) || hasRole(BURNER_ROLE, _msgSender()),
            'ERC721: caller is not owner nor approved'
        );
        delete mintPassInfos[tokenId];
        _burn(tokenId);
    }

    function setRoleAdmin(bytes32 roleId, bytes32 adminRoleId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(roleId, adminRoleId);
    }

    function setDefaultRoyaltyInfo(address receiver, uint96 feeNumerator) external onlyRole(ROYALTY_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function deleteDefaultRoyalty() external onlyRole(ROYALTY_ROLE) {
        _deleteDefaultRoyalty();
    }

    function setTokenRoyalty(
        uint256 tokenId,
        address recipient,
        uint96 fraction
    ) external onlyRole(ROYALTY_ROLE) {
        _setTokenRoyalty(tokenId, recipient, fraction);
    }

    function resetTokenRoyalty(uint256 tokenId) external onlyRole(ROYALTY_ROLE) {
        _resetTokenRoyalty(tokenId);
    }

    function _baseURI()
        internal
        view
        override(UriRoleBaseTokenURIUpgradeable, ERC721Upgradeable)
        returns (string memory)
    {
        return super._baseURI();
    }

    function _burn(uint256 tokenId) internal virtual override(ERC721Upgradeable, ERC721RoyaltyUpgradeable) {
        super._burn(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    )
        internal
        virtual
        override(
            ERC721Upgradeable,
            ERC721FilteringOperatorUpgradeable,
            ERC721EnumerableUpgradeable,
            ERC721PausableUpgradeable
        )
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function _approve(address to, uint256 tokenId)
        internal
        virtual
        override(ERC721Upgradeable, ERC721FilteringOperatorUpgradeable)
    {
        super._approve(to, tokenId);
    }

    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual override(ERC721Upgradeable, ERC721FilteringOperatorUpgradeable) {
        super._setApprovalForAll(owner, operator, approved);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(
            IERC165Upgradeable,
            ERC721Upgradeable,
            ERC721FilteringOperatorUpgradeable,
            ERC721EnumerableUpgradeable,
            ERC721RoyaltyUpgradeable,
            AccessControlEnumerableUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
