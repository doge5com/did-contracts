// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../BaseRegistrarUpgradeable.sol';

contract RegistrarUpgradeable is BaseRegistrarUpgradeable {
    function initialize(
        IRegistry _registry,
        address _priceOracle,
        address _feeRecipient,
        string memory _tld,
        string memory _name,
        string memory _symbol
    ) public initializer {
        __BaseRegistrar_init(_registry, _priceOracle, payable(_feeRecipient), _tld, _name, _symbol);

        setMinNameStrLen(5);
    }
}
