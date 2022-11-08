// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

import '@openzeppelin/contracts/utils/math/SafeMath.sol';

library ScheduleMath {
    struct AuctionScheduleDropParams {
        uint256 limit;
        uint256 dropMultiple;
    }
    struct AuctionSchedule {
        uint256 startTimestamp;
        uint256 dropPeriodSeconds;
        uint256 startPrice;
        uint256 dropPriceStep;
        uint256 reservePrice;
        AuctionScheduleDropParams dropParams1;
        AuctionScheduleDropParams dropParams2;
        AuctionScheduleDropParams dropParams3;
        AuctionScheduleDropParams dropParams4;
    }

    function currentPrice(AuctionSchedule memory s, uint256 timestamp) internal pure returns (uint256) {
        if (s.startTimestamp == 0) return type(uint256).max;
        if (timestamp < s.startTimestamp) return type(uint256).max;
        if (s.dropPeriodSeconds == 0) return s.reservePrice;

        uint256 secondsElapsed = timestamp - s.startTimestamp;
        uint256 drops = secondsElapsed / s.dropPeriodSeconds;

        uint256 price = s.startPrice;

        (drops, price) = doDrop(s.dropParams1.limit, drops, price, s.dropParams1.dropMultiple * s.dropPriceStep);
        (drops, price) = doDrop(s.dropParams2.limit, drops, price, s.dropParams2.dropMultiple * s.dropPriceStep);
        (drops, price) = doDrop(s.dropParams3.limit, drops, price, s.dropParams3.dropMultiple * s.dropPriceStep);
        (drops, price) = doDrop(s.dropParams4.limit, drops, price, s.dropParams4.dropMultiple * s.dropPriceStep);

        if (price < s.reservePrice) price = s.reservePrice;
        return price;
    }

    function doDrop(
        uint256 limit,
        uint256 remaining,
        uint256 price,
        uint256 dropPriceStep
    ) private pure returns (uint256 _remaining, uint256 _price) {
        uint256 effectiveDrops = remaining;
        if (effectiveDrops > limit) effectiveDrops = limit;
        (bool ok, uint256 totalDropPrice) = SafeMath.tryMul(effectiveDrops, dropPriceStep);
        if (!ok || totalDropPrice > price) totalDropPrice = price;
        price -= totalDropPrice;
        return (remaining - effectiveDrops, price);
    }
}
