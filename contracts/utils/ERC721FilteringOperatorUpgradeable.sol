// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import { IERC165Upgradeable, ERC721Upgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol';
import { AccessControlEnumerableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';

import '../interfaces/IOperatorFilterUpgradeable.sol';

abstract contract ERC721FilteringOperatorUpgradeable is ERC721Upgradeable, AccessControlEnumerableUpgradeable {
    bytes32 public constant SET_OPERATOR_FILTER_ROLE = keccak256('SET_OPERATOR_FILTER_ROLE');

    IOperatorFilterUpgradeable public operatorFilter;

    function __ERC721OperatorFilter_init(address filter) internal onlyInitializing {
        __ERC721OperatorFilter_init_unchained(filter);
    }

    function __ERC721OperatorFilter_init_unchained(address filter) internal onlyInitializing {
        _grantRole(SET_OPERATOR_FILTER_ROLE, _msgSender());
        setOperatorFilter(IOperatorFilterUpgradeable(filter));
    }

    function setOperatorFilter(IOperatorFilterUpgradeable filter) public onlyRole(SET_OPERATOR_FILTER_ROLE) {
        operatorFilter = filter;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721Upgradeable) {
        super._beforeTokenTransfer(from, to, tokenId);
        require(
            from == address(0) ||
                to == address(0) ||
                address(operatorFilter) == address(0) ||
                operatorFilter.filterTransfer(from),
            'ERC721OperatorFilter: illegal transfer operator'
        );
    }

    function _approve(address to, uint256 tokenId) internal virtual override(ERC721Upgradeable) {
        super._approve(to, tokenId);
        require(
            to == address(0) || address(operatorFilter) == address(0) || operatorFilter.filterApprove(to),
            'ERC721OperatorFilter: illegal approve operator'
        );
    }

    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual override(ERC721Upgradeable) {
        super._setApprovalForAll(owner, operator, approved);
        require(
            operator == address(0) || address(operatorFilter) == address(0) || operatorFilter.filterApprove(operator),
            'ERC721OperatorFilter: illegal approvalForAll operator'
        );
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721Upgradeable, AccessControlEnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
