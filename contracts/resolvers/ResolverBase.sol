// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/utils/introspection/ERC165.sol';

abstract contract ResolverBase is ERC165 {
    function isAuthorised(bytes32 node) internal view virtual returns (bool);

    modifier authorised(bytes32 node) {
        require(isAuthorised(node), 'ResolverBase: caller is not node owner nor authorised');
        _;
    }
}
