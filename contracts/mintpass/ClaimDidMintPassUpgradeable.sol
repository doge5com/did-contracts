// SPDX-License-Identifier: MIT

pragma solidity >=0.8.8;

import { IERC20Upgradeable, SafeERC20Upgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import { ERC721Upgradeable, ERC721EnumerableUpgradeable } from '@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol';
import { UUPSUpgradeable } from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import { EnumerableSetUpgradeable } from '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import { StringsUpgradeable } from '@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol';

import { WithdrawerRoleTokenWithdrawUpgradeable } from '../utils/WithdrawerRoleTokenWithdrawUpgradeable.sol';
import { IDIDMintPassUpgradeable } from '../interfaces/IDIDMintPassUpgradeable.sol';
import { SafeMath, ScheduleMath } from '../libraries/ScheduleMath.sol';
import { StringUtils } from '../libraries/StringUtils.sol';

contract ClaimDidMintPassUpgradeable is UUPSUpgradeable, WithdrawerRoleTokenWithdrawUpgradeable {
    using SafeMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ScheduleMath for ScheduleMath.AuctionSchedule;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using StringsUpgradeable for uint256;
    using StringUtils for string;

    bytes32 public constant DEV_ROLE = keccak256('DEV_ROLE');
    bytes32 public constant UPGRADE_ROLE = keccak256('UPGRADE_ROLE');

    struct PurchasedInfo {
        uint256 netPaid;
        uint256 numPurchased;
    }

    struct SegmentInfo {
        // when fromId > toId is sold out.
        uint256 fromId; // NFT tokenID start with [from,
        uint256 toId; // NFT tokenID end with ,toId]
        uint256 width; // width of the did name. eg: 4, tokenId 1 then did name is 0001
    }

    // buyer => PurchasedInfo
    mapping(address => PurchasedInfo) public purchasedInfos;
    // segmentId => SegmentInfo
    mapping(uint256 => SegmentInfo) public segmentInfos;
    EnumerableSetUpgradeable.UintSet private segmentIds;

    IERC20Upgradeable public paymentToken;
    IDIDMintPassUpgradeable public didMintPass;

    ScheduleMath.AuctionSchedule public auctionSchedule;
    bool public proceedsWithdrawn;
    uint256 public purchasedTotal;
    uint256 public maxCreated;
    uint256 public endTimestamp;

    event MintPassPurchase(
        address indexed buyer,
        uint256 count,
        uint256 payment,
        uint256 priceEach,
        uint256[] tokenIds
    );

    event RebateClaim(address indexed buyer, uint256 claimed);

    event ProceedsWithdrawal(uint256 amount);

    event AddSegmentInfo(uint256 indexed segmentId, uint256 fromId, uint256 toId, uint256 width);
    event RemoveSegmentInfo(uint256 indexed segmentId);
    event AuctionScheduleChange(ScheduleMath.AuctionSchedule schedule);

    function initialize(address _paymentToken, address _didMintPass) external virtual initializer {
        __ERC1967Upgrade_init_unchained();
        __UUPSUpgradeable_init_unchained();

        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __AccessControlEnumerable_init_unchained();
        __WithdrawerRoleTokenWithdraw_init_unchained();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(DEV_ROLE, _msgSender());

        paymentToken = IERC20Upgradeable(_paymentToken);
        didMintPass = IDIDMintPassUpgradeable(_didMintPass);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADE_ROLE) {}

    function addSegmentInfos(uint256[] calldata _segmentIds, SegmentInfo[] calldata _segmentInfos)
        external
        onlyRole(DEV_ROLE)
    {
        require(_segmentIds.length == _segmentInfos.length, 'segmentIds.length != segmentInfos.length');
        for (uint256 i = 0; i < _segmentIds.length; i++) {
            uint256 segmentId = _segmentIds[i];
            SegmentInfo memory segmentInfo = _segmentInfos[i];
            require(segmentInfo.fromId <= segmentInfo.toId, 'fromId > toId');
            require(segmentInfo.width > 0, 'width <= 0');
            segmentInfos[segmentId] = segmentInfo;
            segmentIds.add(segmentId);
            maxCreated += segmentInfo.toId - segmentInfo.fromId + 1;
            emit AddSegmentInfo(segmentId, segmentInfo.fromId, segmentInfo.toId, segmentInfo.width);
        }
    }

    function removeSegmentInfos(uint256[] calldata _segmentIds) external onlyRole(DEV_ROLE) {
        for (uint256 i; i < _segmentIds.length; ++i) {
            maxCreated -= segmentInfos[_segmentIds[i]].toId - segmentInfos[_segmentIds[i]].fromId + 1;
            segmentIds.remove(_segmentIds[i]);
            emit RemoveSegmentInfo(_segmentIds[i]);
        }
    }

    function getSegmentIds() external view returns (uint256[] memory ids) {
        ids = new uint256[](segmentIds.length());
        for (uint256 i = 0; i < ids.length; ++i) {
            ids[i] = segmentIds.at(i);
        }
    }

    function updateAuctionSchedule(ScheduleMath.AuctionSchedule memory schedule) public onlyRole(DEV_ROLE) {
        require(endTimestamp == 0, 'auction ended');
        uint256 oldPrice = currentPrice();
        auctionSchedule = schedule;
        uint256 newPrice = currentPrice();
        require(newPrice <= oldPrice, 'price increased');
        emit AuctionScheduleChange(schedule);
    }

    function pauseAuctionSchedule() external onlyRole(DEV_ROLE) {
        uint256 price = currentPrice();
        ScheduleMath.AuctionSchedule memory schedule; // zero-initialized
        if (price != type(uint256).max) {
            schedule.startTimestamp = 1;
            schedule.dropPeriodSeconds = 0;
            schedule.reservePrice = price;
        }
        updateAuctionSchedule(schedule);
    }

    function genRandomNumber(uint256 seed, uint256 max) internal view returns (uint256 randomNumber) {
        return (uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.coinbase,
                    block.number,
                    block.timestamp,
                    _msgSender(),
                    block.difficulty,
                    seed
                )
            )
        ) % max);
    }

    function _getNextTokenId(uint256 orderNum) internal virtual returns (uint256 tokenId, string memory name) {
        uint256 segmentId = segmentIds.at(genRandomNumber(orderNum, segmentIds.length()));
        tokenId = segmentInfos[segmentId].fromId;
        segmentInfos[segmentId].fromId++;
        if (segmentInfos[segmentId].fromId > segmentInfos[segmentId].toId) {
            segmentIds.remove(segmentId);
        }
        name = tokenId.toString().padStart(segmentInfos[segmentId].width, '0');
    }

    function _createMintPasses(address recipient, uint256 count) internal returns (uint256[] memory tokenIds) {
        require(count != 0, 'count is zero');
        require(count + purchasedTotal <= maxCreated, 'minted out');
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            (uint256 tokenId, string memory name) = _getNextTokenId(i);
            didMintPass.mint(recipient, tokenId, name, 0);
            tokenIds[i] = tokenId;
        }
    }

    function purchase(uint256 paymentAmount, uint256 count) external returns (uint256[] memory tokenIds) {
        uint256 priceEach = currentPrice();
        require(priceEach != type(uint256).max, 'auction not started');
        if (paymentAmount != 0) {
            // maybe use rebate to buy next tokenId
            paymentToken.safeTransferFrom(_msgSender(), address(this), paymentAmount);
        }

        PurchasedInfo storage purchasedInfo = purchasedInfos[_msgSender()];
        purchasedInfo.netPaid = purchasedInfo.netPaid + paymentAmount;
        purchasedInfo.numPurchased = purchasedInfo.numPurchased + count;

        (bool ok, uint256 priceTotal) = priceEach.tryMul(purchasedInfo.numPurchased);
        if (!ok || purchasedInfo.netPaid < priceTotal) revert('underpaid');

        tokenIds = _createMintPasses(_msgSender(), count);
        purchasedTotal += count;
        if (purchasedTotal == maxCreated) endTimestamp = block.timestamp;
        emit MintPassPurchase(_msgSender(), count, paymentAmount, priceEach, tokenIds);
    }

    function _computeRebate(address buyer) internal view returns (uint256 rebate, uint256 clearingCost) {
        clearingCost = purchasedInfos[buyer].numPurchased * currentPrice();
        rebate = purchasedInfos[buyer].netPaid - clearingCost;
    }

    function rebateAmount(address buyer) public view returns (uint256 rebate) {
        (rebate, ) = _computeRebate(buyer);
    }

    function claimRebate() external {
        claimRebateTo(_msgSender());
    }

    function claimRebateTo(address recipient) public {
        (uint256 rebate, uint256 clearingCost) = _computeRebate(_msgSender());
        purchasedInfos[_msgSender()].netPaid = clearingCost;
        emit RebateClaim(_msgSender(), rebate);
        paymentToken.safeTransfer(recipient, rebate);
    }

    function withdrawProceeds(address recipient) external onlyRole(DEV_ROLE) {
        require(endTimestamp != 0, 'auction not ended');
        require(!proceedsWithdrawn, 'already withdrawn');
        proceedsWithdrawn = true;
        uint256 proceeds = currentPrice() * purchasedTotal;
        if (proceeds > paymentToken.balanceOf(address(this))) {
            proceeds = paymentToken.balanceOf(address(this));
        }
        emit ProceedsWithdrawal(proceeds);
        paymentToken.safeTransfer(recipient, proceeds);
    }

    function currentPrice() public view returns (uint256) {
        return priceAt(endTimestamp != 0 ? endTimestamp : block.timestamp);
    }

    function priceAt(uint256 timestamp) public view returns (uint256) {
        return auctionSchedule.currentPrice(timestamp);
    }
}
