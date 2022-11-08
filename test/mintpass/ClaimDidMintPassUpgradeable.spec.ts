import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  ClaimDidMintPassUpgradeable,
  ClaimDidMintPassUpgradeable__factory,
  DidMintPassUpgradeable,
  DidMintPassUpgradeable__factory,
  MockERC20,
  MockERC20__factory,
} from 'typechain-types'
import { expect } from 'chai'
import { advanceBlock, setNextTimestamp, latest, setNextTimestampAndAdvanceBlock } from '../helpers'
import { TransactionResponse } from '@ethersproject/abstract-provider/src.ts'
import { BigNumberish } from 'ethers'
import {
  ScheduleMath as TypeScheduleMath,
  ClaimDidMintPassUpgradeable as TypeClaimDidMintPassUpgradeable,
} from 'typechain-types/contracts/mintpass/ClaimDidMintPassUpgradeable'
const { BigNumber, constants } = require('ethers')
const { ethers, network, upgrades } = require('hardhat')

describe('ClaimDidMintPassUpgradeable', () => {
  let didMintPassOwner: SignerWithAddress
  let claimDidMintPassOwner: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let jack: SignerWithAddress
  let guest: SignerWithAddress
  let paymentToken: MockERC20
  let didMintPass: DidMintPassUpgradeable
  let claimDidMintPass: ClaimDidMintPassUpgradeable
  const initPaymentTokenAmount = BigNumber.from(10).pow(18).mul(10000)
  beforeEach(async () => {
    ;[didMintPassOwner, claimDidMintPassOwner, alice, bob, jack, guest] = await ethers.getSigners()

    const MockERC20: MockERC20__factory = await ethers.getContractFactory('MockERC20')
    paymentToken = await MockERC20.deploy('MOCKERC20', 'MOCKERC20')
    await paymentToken.deployed()

    const DidMintPassUpgradeable: DidMintPassUpgradeable__factory = await ethers.getContractFactory(
      'DidMintPassUpgradeable',
      didMintPassOwner
    )
    didMintPass = await upgrades.deployProxy(DidMintPassUpgradeable, ['DidMintPass', 'PASS', ''])
    await didMintPass.deployed()

    const ClaimDidMintPassUpgradeable: ClaimDidMintPassUpgradeable__factory = await ethers.getContractFactory(
      'ClaimDidMintPassUpgradeable',
      claimDidMintPassOwner
    )
    claimDidMintPass = await upgrades.deployProxy(ClaimDidMintPassUpgradeable, [
      paymentToken.address,
      didMintPass.address,
    ])
    await claimDidMintPass.deployed()

    // grant didMintPass mint role to claimDidMintPass
    const minterRole = await didMintPass.MINTER_ROLE()
    await didMintPass.connect(didMintPassOwner).grantRole(minterRole, claimDidMintPass.address)

    // mint token
    await paymentToken.mint(alice.address, initPaymentTokenAmount)
    await paymentToken.mint(bob.address, initPaymentTokenAmount)
    await paymentToken.mint(jack.address, initPaymentTokenAmount)

    // approve
    await paymentToken.connect(alice).approve(claimDidMintPass.address, constants.MaxUint256)
    await paymentToken.connect(bob).approve(claimDidMintPass.address, constants.MaxUint256)
    await paymentToken.connect(jack).approve(claimDidMintPass.address, constants.MaxUint256)
  })

  const buildBasicSchedule = (
    startTimestamp: BigNumberish,
    startPrice: BigNumberish
  ): TypeScheduleMath.AuctionScheduleStruct => {
    return {
      startTimestamp,
      dropPeriodSeconds: 60,
      startPrice,
      dropPriceStep: BigNumber.from(10).pow(18).mul(5),
      reservePrice: BigNumber.from(10).pow(18).mul(100),
      dropParams1: { limit: 10, dropMultiple: 8 },
      dropParams2: { limit: 15, dropMultiple: 4 },
      dropParams3: { limit: 20, dropMultiple: 2 },
      dropParams4: { limit: constants.MaxUint256, dropMultiple: 1 },
    }
  }

  const getSegmentIdAndInfos = (): [number, BigNumberish[], TypeClaimDidMintPassUpgradeable.SegmentInfoStruct[]] => {
    let maxCreated = 0
    const segmentIds = []
    const segmentInfos = []
    let segmentId = 0
    for (let i = 0; i < 799; i += 100, segmentId++) {
      segmentIds.push(segmentId)
      segmentInfos.push({
        fromId: i,
        toId: i + 1, // less range for test
        width: 3,
      })
      maxCreated += 2
    }
    segmentIds.push(segmentId)
    segmentInfos.push({
      fromId: 800,
      toId: 805, // less range for test
      width: 3,
    })
    maxCreated += 6
    return [maxCreated, segmentIds, segmentInfos]
  }

  const diffPaymentToken = async (txPromise: Promise<TransactionResponse>) => {
    const tx = await txPromise
    const rx = await tx.wait()
    const address = tx.from
    const before = await paymentToken.balanceOf(address, { blockTag: rx.blockNumber - 1 })
    const after = await paymentToken.balanceOf(address, { blockTag: rx.blockNumber })
    return after.sub(before)
  }

  it('supports reserving, purchasing, rebating, and withdrawing', async () => {
    // init vars verify
    expect(await claimDidMintPass.endTimestamp()).to.equal(0)
    expect(await claimDidMintPass.proceedsWithdrawn()).to.equal(false)
    expect(await claimDidMintPass.purchasedTotal()).to.equal(0)
    expect(await claimDidMintPass.maxCreated()).to.equal(0)
    await expect(claimDidMintPass.connect(alice).purchase(BigNumber.from(10).pow(18).mul(100), 2)).to.be.revertedWith(
      'auction not started'
    )

    const startTimestamp = +(await latest()) + 10
    await setNextTimestamp(startTimestamp)
    const basicSchedule = buildBasicSchedule(startTimestamp, BigNumber.from(10).pow(18).mul(1000))
    await expect(claimDidMintPass.connect(claimDidMintPassOwner).updateAuctionSchedule(basicSchedule)).to.emit(
      claimDidMintPass,
      'AuctionScheduleChange'
    )

    const [maxCreated, segmentIds, segmentInfos] = getSegmentIdAndInfos()
    await expect(claimDidMintPass.connect(claimDidMintPassOwner).addSegmentInfos(segmentIds, segmentInfos)).to.emit(
      claimDidMintPass,
      'AddSegmentInfo'
    )
    expect(await claimDidMintPass.maxCreated()).to.equal(maxCreated)

    await setNextTimestamp(startTimestamp + 10)
    // Purchase two, overpaying the current exact price a bit.
    {
      const currentPrice = await claimDidMintPass.priceAt(startTimestamp + 10)
      const payment = currentPrice.mul(2).add(10)
      await expect(claimDidMintPass.connect(alice).purchase(payment, 2)).to.emit(claimDidMintPass, 'MintPassPurchase')
    }
    expect(await claimDidMintPass.purchasedTotal()).to.equal(2)

    // Try underpaying, which should fail.
    const priceAfter65 = await claimDidMintPass.priceAt(startTimestamp + 65)

    await setNextTimestamp(startTimestamp + 65)
    await expect(claimDidMintPass.connect(bob).purchase(priceAfter65.mul(2).sub(1), 2)).to.be.revertedWith('underpaid')

    await setNextTimestamp(startTimestamp + 66)
    expect(await claimDidMintPass.priceAt(startTimestamp + 66)).to.deep.equal(priceAfter65) // not a drop boundary
    await expect(claimDidMintPass.connect(bob).purchase(priceAfter65.mul(2), 2)).to.emit(
      claimDidMintPass,
      'MintPassPurchase'
    )

    await setNextTimestamp(startTimestamp + 125)
    // Pay exact change for one.
    await expect(
      claimDidMintPass.connect(bob).purchase(await claimDidMintPass.priceAt(startTimestamp + 125), 1)
    ).to.emit(claimDidMintPass, 'MintPassPurchase')
    await setNextTimestampAndAdvanceBlock(startTimestamp + 184)
    // Claim an incremental rebate.
    {
      const aliceTotalNetPayment = initPaymentTokenAmount.sub(await paymentToken.balanceOf(alice.address))
      const aliceRebate1 = aliceTotalNetPayment.sub((await claimDidMintPass.priceAt(startTimestamp + 184)).mul(2))
      const purchasedInfo = await claimDidMintPass.purchasedInfos(alice.address)
      expect(purchasedInfo.netPaid).to.deep.equal(aliceTotalNetPayment)
      expect(purchasedInfo.numPurchased).to.deep.equal(BigNumber.from(2))

      expect(await claimDidMintPass.rebateAmount(alice.address)).to.deep.equal(aliceRebate1)
      await setNextTimestamp(startTimestamp + 185)
      expect(await diffPaymentToken(claimDidMintPass.connect(alice).claimRebate())).to.equal(aliceRebate1)
    }
    expect(await claimDidMintPass.rebateAmount(alice.address)).to.equal(BigNumber.from(10).pow(18).mul(0))

    await expect(
      claimDidMintPass.connect(claimDidMintPassOwner).withdrawProceeds(claimDidMintPassOwner.address)
    ).to.be.revertedWith('auction not ended')

    await setNextTimestampAndAdvanceBlock(startTimestamp + 60 * 60)
    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(100)) // reserve price
    expect(await claimDidMintPass.endTimestamp()).to.equal(0)
    // Purchase the last piece at the reserve price, slightly overpaying.
    // This ends the auction.
    await setNextTimestamp(startTimestamp + 60 * 60 + 5)
    // buy all of remaining in the market
    const remaining = BigNumber.from(maxCreated).sub(await claimDidMintPass.purchasedTotal())
    await expect(claimDidMintPass.connect(jack).purchase(remaining.mul(basicSchedule.reservePrice), remaining)).to.emit(
      claimDidMintPass,
      'MintPassPurchase'
    )
    expect(await claimDidMintPass.endTimestamp()).to.equal(startTimestamp + 60 * 60 + 5)

    expect(await claimDidMintPass.purchasedTotal()).to.equal(maxCreated)

    {
      const aliceNetPayment = initPaymentTokenAmount.sub(await paymentToken.balanceOf(alice.address))
      const aliceRebate2 = aliceNetPayment.sub(
        (await didMintPass.balanceOf(alice.address)).mul(basicSchedule.reservePrice.toString())
      )
      expect(await claimDidMintPass.rebateAmount(alice.address)).to.equal(aliceRebate2)
      expect(await diffPaymentToken(claimDidMintPass.connect(alice).claimRebate())).to.equal(aliceRebate2)
    }

    {
      const bobNetPayment = initPaymentTokenAmount.sub(await paymentToken.balanceOf(bob.address))
      const bobRebate2 = bobNetPayment.sub(
        (await didMintPass.balanceOf(bob.address)).mul(basicSchedule.reservePrice.toString())
      )
      expect(await claimDidMintPass.rebateAmount(bob.address)).to.equal(bobRebate2)
      expect(await claimDidMintPass.rebateAmount(bob.address)).to.equal(bobRebate2)
      expect(await diffPaymentToken(claimDidMintPass.connect(bob).claimRebate())).to.equal(bobRebate2)
    }

    expect(await claimDidMintPass.rebateAmount(claimDidMintPassOwner.address)).to.equal(0)
    expect(await claimDidMintPass.rebateAmount(guest.address)).to.equal(0)
    expect(await diffPaymentToken(claimDidMintPass.connect(claimDidMintPassOwner).claimRebate())).to.equal(0)
    expect(await diffPaymentToken(claimDidMintPass.connect(guest).claimRebate())).to.equal(0)

    expect(await claimDidMintPass.rebateAmount(alice.address)).to.equal(0)
    expect(await claimDidMintPass.rebateAmount(bob.address)).to.equal(0)
    expect(await diffPaymentToken(claimDidMintPass.connect(alice).claimRebate())).to.equal(0)
    expect(await diffPaymentToken(claimDidMintPass.connect(bob).claimRebate())).to.equal(0)

    expect(
      await diffPaymentToken(
        claimDidMintPass.connect(claimDidMintPassOwner).withdrawProceeds(claimDidMintPassOwner.address)
      )
    ).to.equal(BigNumber.from(maxCreated).mul(basicSchedule.reservePrice))
    await expect(
      claimDidMintPass.connect(claimDidMintPassOwner).withdrawProceeds(claimDidMintPassOwner.address)
    ).to.be.revertedWith('already withdrawn')

    expect(await paymentToken.balanceOf(claimDidMintPass.address)).to.equal(0)

    await paymentToken.connect(alice).mint(alice.address, initPaymentTokenAmount.mul(100))
    await expect(
      claimDidMintPass.connect(alice).purchase(await paymentToken.balanceOf(alice.address), 1)
    ).to.be.revertedWith('minted out')
  })

  it('allows atomically applying a rebate to later purchases', async () => {
    const [maxCreated, segmentIds, segmentInfos] = getSegmentIdAndInfos()
    await expect(claimDidMintPass.connect(claimDidMintPassOwner).addSegmentInfos(segmentIds, segmentInfos)).to.emit(
      claimDidMintPass,
      'AddSegmentInfo'
    )
    expect(await claimDidMintPass.maxCreated()).to.equal(maxCreated)

    const startTimestamp = +(await latest()) + 10

    const schedule = {
      startTimestamp,
      dropPeriodSeconds: 60,
      startPrice: BigNumber.from(10).pow(18).mul(1000),
      dropPriceStep: BigNumber.from(10).pow(18).mul(100),
      reservePrice: BigNumber.from(10).pow(18).mul(100),
      dropParams1: { limit: 255, dropMultiple: 1 },
      dropParams2: { limit: 15, dropMultiple: 4 },
      dropParams3: { limit: 20, dropMultiple: 2 },
      dropParams4: { limit: constants.MaxUint256, dropMultiple: 1 },
    }

    await setNextTimestamp(schedule.startTimestamp)
    await expect(claimDidMintPass.connect(claimDidMintPassOwner).updateAuctionSchedule(schedule)).to.emit(
      claimDidMintPass,
      'AuctionScheduleChange'
    )

    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(1000))
    await expect(claimDidMintPass.connect(alice).purchase(BigNumber.from(10).pow(18).mul(2000), 2)).to.emit(
      claimDidMintPass,
      'MintPassPurchase'
    )

    await setNextTimestampAndAdvanceBlock(startTimestamp + 60)
    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(900))
    expect(await claimDidMintPass.rebateAmount(alice.address)).to.equal(BigNumber.from(10).pow(18).mul(200))
    await expect(claimDidMintPass.connect(alice).purchase(BigNumber.from(10).pow(18).mul(700), 1)).to.emit(
      claimDidMintPass,
      'MintPassPurchase'
    )
    expect(await claimDidMintPass.rebateAmount(alice.address)).to.equal(0)
    await expect(claimDidMintPass.connect(alice).purchase(BigNumber.from(10).pow(18).mul(700), 1)).to.be.revertedWith(
      'underpaid'
    )

    await setNextTimestampAndAdvanceBlock(startTimestamp + 60 * 5)
    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(500))
    expect(await claimDidMintPass.rebateAmount(alice.address)).to.equal(BigNumber.from(10).pow(18).mul(1200))
    await expect(claimDidMintPass.connect(alice).purchase(0, 1)).to.emit(claimDidMintPass, 'MintPassPurchase')
    expect(await diffPaymentToken(claimDidMintPass.connect(alice).claimRebate())).to.equal(
      BigNumber.from(10).pow(18).mul(700)
    )

    expect(await didMintPass.balanceOf(alice.address)).to.equal(4)
  })

  it('properly implements a realistic schedule', async () => {
    const startTimestamp = +(await latest()) + 10
    await setNextTimestamp(startTimestamp)
    const schedule = {
      startTimestamp,
      dropPeriodSeconds: 60,
      startPrice: BigNumber.from(10).pow(18).mul(50), // 50 token starting price
      dropPriceStep: BigNumber.from(10).pow(17), // drop 2 token/minute, then 1, then 0.5, then 0.2
      reservePrice: BigNumber.from(10).pow(18).mul(2), // 2 token reserve price
      dropParams1: { limit: 10, dropMultiple: 20 },
      dropParams2: { limit: 15, dropMultiple: 10 },
      dropParams3: { limit: 20, dropMultiple: 5 },
      dropParams4: { limit: constants.MaxUint256, dropMultiple: 2 },
    }
    await expect(claimDidMintPass.updateAuctionSchedule(schedule)).to.emit(claimDidMintPass, 'AuctionScheduleChange')

    async function checkPriceSeconds({
      label,
      seconds,
      expected,
    }: {
      label: string
      seconds: number
      expected: BigNumberish
    }) {
      const actual = await claimDidMintPass.priceAt(startTimestamp + seconds)
      expect({ label, price: String(actual) }).to.deep.equal({
        label,
        price: String(ethers.BigNumber.from(expected)),
      })
    }
    async function checkPrice({ minutes, expected }: { minutes: number; expected: BigNumberish }) {
      const secondsExactly = minutes * 60
      await checkPriceSeconds({
        label: `exactly ${minutes} minutes`,
        seconds: secondsExactly,
        expected,
      })
      await checkPriceSeconds({
        label: `just after ${minutes} minutes`,
        seconds: secondsExactly + 5,
        expected,
      })
    }

    await checkPrice({ minutes: -1, expected: ethers.constants.MaxUint256 })
    // round 1 (2 token/minute)
    await checkPrice({ minutes: 0, expected: BigNumber.from(10).pow(18).mul(50) })
    await checkPrice({ minutes: 1, expected: BigNumber.from(10).pow(18).mul(48) })
    await checkPrice({ minutes: 2, expected: BigNumber.from(10).pow(18).mul(46) })
    // ...
    await checkPrice({ minutes: 9, expected: BigNumber.from(10).pow(18).mul(32) })
    await checkPrice({ minutes: 10, expected: BigNumber.from(10).pow(18).mul(30) })
    // round 2 (1 token/minute)
    await checkPrice({ minutes: 11, expected: BigNumber.from(10).pow(18).mul(29) })
    await checkPrice({ minutes: 12, expected: BigNumber.from(10).pow(18).mul(28) })
    // ...
    await checkPrice({ minutes: 24, expected: BigNumber.from(10).pow(18).mul(16) })
    await checkPrice({ minutes: 25, expected: BigNumber.from(10).pow(18).mul(15) })
    // round 3 (0.5 token/minute)
    await checkPrice({ minutes: 26, expected: BigNumber.from(10).pow(17).mul(145) })
    await checkPrice({ minutes: 27, expected: BigNumber.from(10).pow(18).mul(14) })
    // ...
    await checkPrice({ minutes: 44, expected: BigNumber.from(10).pow(17).mul(55) })
    await checkPrice({ minutes: 45, expected: BigNumber.from(10).pow(18).mul(5) })
    // round 4 (0.2 token/minute)
    await checkPrice({ minutes: 46, expected: BigNumber.from(10).pow(17).mul(48) })
    await checkPrice({ minutes: 47, expected: BigNumber.from(10).pow(17).mul(46) })
    // ...
    await checkPrice({ minutes: 59, expected: BigNumber.from(10).pow(17).mul(22) })
    await checkPrice({ minutes: 60, expected: BigNumber.from(10).pow(18).mul(2) })
    // reserve
    await checkPrice({ minutes: 61, expected: BigNumber.from(10).pow(18).mul(2) })
    await checkPrice({ minutes: 62, expected: BigNumber.from(10).pow(18).mul(2) })
    // ...
    expect(await claimDidMintPass.priceAt(ethers.constants.MaxUint256)).to.equal(BigNumber.from(10).pow(18).mul(2))
  })

  it('permits updating the schedule before or during the auction', async () => {
    const t0 = +(await latest())

    const initialStart = t0 + 10
    await setNextTimestamp(initialStart - 2)
    await expect(
      claimDidMintPass
        .connect(claimDidMintPassOwner)
        .updateAuctionSchedule(buildBasicSchedule(initialStart, BigNumber.from(10).pow(18).mul(1000)))
    ).to.emit(claimDidMintPass, 'AuctionScheduleChange')

    // Still before start.
    expect(await claimDidMintPass.currentPrice()).to.equal(ethers.constants.MaxUint256)

    await setNextTimestampAndAdvanceBlock(initialStart)
    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(1000))

    await setNextTimestampAndAdvanceBlock(initialStart + 60)
    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(960))

    // Move the start time back, which decreases the current price.
    await expect(
      claimDidMintPass
        .connect(claimDidMintPassOwner)
        .updateAuctionSchedule(buildBasicSchedule(initialStart - 60, BigNumber.from(10).pow(18).mul(1000)))
    ).to.emit(claimDidMintPass, 'AuctionScheduleChange')

    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(920))

    // Move the start time forward but drop the start price.
    await setNextTimestamp(initialStart + 120)
    await advanceBlock()
    await expect(
      claimDidMintPass
        .connect(claimDidMintPassOwner)
        .updateAuctionSchedule(buildBasicSchedule(initialStart + 120, BigNumber.from(10).pow(18).mul(500)))
    ).to.emit(claimDidMintPass, 'AuctionScheduleChange')
    expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(500))
  })

  describe('pausing', () => {
    it('permits pausing the schedule before or during the auction', async () => {
      const t0 = +(await latest())

      await expect(claimDidMintPass.connect(claimDidMintPassOwner).pauseAuctionSchedule()).to.emit(
        claimDidMintPass,
        'AuctionScheduleChange'
      )
      expect(await claimDidMintPass.priceAt(0)).to.equal(constants.MaxUint256)
      expect(await claimDidMintPass.priceAt(constants.MaxUint256)).to.equal(constants.MaxUint256)

      let auctionSchedule = await claimDidMintPass.auctionSchedule()
      expect(auctionSchedule.startTimestamp).to.deep.equal(BigNumber.from(0))
      expect(auctionSchedule.reservePrice).to.deep.equal(BigNumber.from(0))

      const t1 = t0 + 10
      await setNextTimestamp(t1 - 3)
      await claimDidMintPass.updateAuctionSchedule(buildBasicSchedule(t1, BigNumber.from(10).pow(18).mul(1000)))
      expect(await claimDidMintPass.priceAt(0)).to.equal(constants.MaxUint256)
      expect(await claimDidMintPass.priceAt(constants.MaxUint256)).to.equal(BigNumber.from(10).pow(18).mul(100))
      await expect(claimDidMintPass.connect(claimDidMintPassOwner).pauseAuctionSchedule()).to.emit(
        claimDidMintPass,
        'AuctionScheduleChange'
      )
      expect(await claimDidMintPass.priceAt(0)).to.equal(constants.MaxUint256)
      expect(await claimDidMintPass.priceAt(t1)).to.equal(constants.MaxUint256)
      expect(await claimDidMintPass.priceAt(constants.MaxUint256)).to.equal(constants.MaxUint256)
      auctionSchedule = await claimDidMintPass.auctionSchedule()
      expect(auctionSchedule.startTimestamp).to.deep.equal(BigNumber.from(0))
      expect(auctionSchedule.reservePrice).to.deep.equal(BigNumber.from(0))

      const t2 = t1 + 10
      await setNextTimestamp(t2 - 3)
      await expect(
        claimDidMintPass
          .connect(claimDidMintPassOwner)
          .updateAuctionSchedule(buildBasicSchedule(t2, BigNumber.from(10).pow(18).mul(1000)))
      ).to.emit(claimDidMintPass, 'AuctionScheduleChange')
      await setNextTimestamp(t2 + 77)
      await advanceBlock()
      expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(960))
      expect(await claimDidMintPass.priceAt(constants.MaxUint256)).to.equal(BigNumber.from(10).pow(18).mul(100))

      await expect(claimDidMintPass.connect(claimDidMintPassOwner).pauseAuctionSchedule()).to.emit(
        claimDidMintPass,
        'AuctionScheduleChange'
      )
      expect(await claimDidMintPass.priceAt(0)).to.equal(constants.MaxUint256)
      expect(await claimDidMintPass.priceAt(1)).to.equal(BigNumber.from(10).pow(18).mul(960))
      expect(await claimDidMintPass.currentPrice()).to.equal(BigNumber.from(10).pow(18).mul(960))
      expect(await claimDidMintPass.priceAt(constants.MaxUint256)).to.equal(BigNumber.from(10).pow(18).mul(960))
      auctionSchedule = await claimDidMintPass.auctionSchedule()
      expect(auctionSchedule.startTimestamp).to.deep.equal(BigNumber.from(1))
      expect(auctionSchedule.reservePrice).to.deep.equal(BigNumber.from(BigNumber.from(10).pow(18).mul(960)))
    })

    it('only lets the owner pause the auction', async () => {
      await claimDidMintPass.connect(claimDidMintPassOwner).callStatic.pauseAuctionSchedule()
      await expect(claimDidMintPass.connect(didMintPassOwner).callStatic.pauseAuctionSchedule()).to.be.revertedWith(
        'AccessControl:'
      )
    })
  })

  it('prevents updating the schedule if the price would increase', async () => {
    const startTimestamp = +(await latest())
    const oldSchedule = buildBasicSchedule(startTimestamp, BigNumber.from(10).pow(18).mul(100))
    await expect(claimDidMintPass.connect(claimDidMintPassOwner).updateAuctionSchedule(oldSchedule)).to.emit(
      claimDidMintPass,
      'AuctionScheduleChange'
    )
    const newSchedule = buildBasicSchedule(startTimestamp, BigNumber.from(10).pow(18).mul(101))
    await expect(claimDidMintPass.connect(claimDidMintPassOwner).updateAuctionSchedule(newSchedule)).to.be.revertedWith(
      'price increased'
    )
  })

  it('prevents updating the schedule if the auction is over', async () => {
    await expect(
      claimDidMintPass.connect(claimDidMintPassOwner).addSegmentInfos(
        [0],
        [
          {
            fromId: 0,
            toId: 0,
            width: 3,
          },
        ]
      )
    )
      .to.emit(claimDidMintPass, 'AddSegmentInfo')
      .withArgs(BigNumber.from(0), BigNumber.from(0), BigNumber.from(0), BigNumber.from(3))
    expect(await claimDidMintPass.maxCreated()).to.equal(1)
    const startTimestamp = +(await latest())
    const oldSchedule = buildBasicSchedule(startTimestamp, BigNumber.from(10).pow(18).mul(100))
    await claimDidMintPass.updateAuctionSchedule(oldSchedule)
    await claimDidMintPass.connect(alice).purchase(BigNumber.from(10).pow(18).mul(100), 1)
    const newSchedule = buildBasicSchedule(startTimestamp, 50)
    await expect(claimDidMintPass.updateAuctionSchedule(newSchedule)).to.be.revertedWith('auction ended')
  })
})
