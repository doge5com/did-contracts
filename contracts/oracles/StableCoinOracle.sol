// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '../interfaces/IPriceOracle.sol';
import '../libraries/StringUtils.sol';

// StableCoinOracle sets a price in USD, based on an oracles.
contract StableCoinOracle is IPriceOracle {
    using SafeMath for *;
    using StringUtils for *;

    uint256 public constant ONE_YEAR_DURATION = 31556952;

    address private immutable _paymentCurrency;

    // Rent in base price units by length
    uint256 public immutable price1Letter;
    uint256 public immutable price2Letter;
    uint256 public immutable price3Letter;
    uint256 public immutable price4Letter;
    uint256 public immutable price5Letter;

    constructor(address _currency, uint256[] memory _rentPrices) {
        _paymentCurrency = _currency;

        price1Letter = _rentPrices[0];
        price2Letter = _rentPrices[1];
        price3Letter = _rentPrices[2];
        price4Letter = _rentPrices[3];
        price5Letter = _rentPrices[4];
    }

    function price(
        string calldata name,
        uint256, /*expires*/
        uint256 duration
    ) external view override returns (IPriceOracle.Price memory) {
        uint256 len = name.strlen();
        uint256 stablePrice;

        if (len >= 5) {
            stablePrice = price5Letter * duration;
        } else if (len == 4) {
            stablePrice = price4Letter * duration;
        } else if (len == 3) {
            stablePrice = price3Letter * duration;
        } else if (len == 2) {
            stablePrice = price2Letter * duration;
        } else {
            stablePrice = price1Letter * duration;
        }

        stablePrice = stablePrice / ONE_YEAR_DURATION;

        return IPriceOracle.Price({ currency: currency(), base: stablePrice, premium: 0 });
    }

    function currency() public view override returns (address) {
        return _paymentCurrency;
    }

    function supportsInterface(bytes4 interfaceID) public view virtual returns (bool) {
        return interfaceID == type(IERC165).interfaceId || interfaceID == type(IPriceOracle).interfaceId;
    }
}
