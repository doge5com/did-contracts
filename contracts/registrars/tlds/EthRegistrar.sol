// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '../BaseRegistrar.sol';

contract EthRegistrar is BaseRegistrar {
    constructor(
        IRegistry _registry,
        address _priceOracle,
        address _feeRecipient
    ) BaseRegistrar(_registry, _priceOracle, payable(_feeRecipient), 'eth', 'DID', 'ETH') {}
}
