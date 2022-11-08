// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../BaseRegistrar.sol';

contract Registrar is BaseRegistrar {
    constructor(
        IRegistry _registry,
        address _priceOracle,
        address _feeRecipient,
        string memory tld_,
        string memory _name,
        string memory _symbol
    ) BaseRegistrar(_registry, _priceOracle, payable(_feeRecipient), tld_, _name, _symbol) {
        setMinNameStrLen(5);
    }
}
