import { UniversalRegistry, EthRegistrar, DummyOracle, LinearPremiumPriceOracle } from 'typechain-types'
import { deploy, EMPTY_NODE, latest } from '../helpers'
import { ethers } from 'hardhat'
import { assert, expect } from 'chai'

const sha3 = require('web3-utils').sha3
import { BigNumber } from 'ethers'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DAY = 86400

describe('LinearPremiumPriceOracle', () => {
  let priceOracle: LinearPremiumPriceOracle, ens: UniversalRegistry, registrar: EthRegistrar

  before(async () => {
    // Dummy oracles with 1 ETH == 2 USD
    const dummyOracle = await deploy('DummyOracle', BigNumber.from(200000000))
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    // Pricing premium starts out at 100 USD at expiry and decreases to 0 over 100k seconds (a bit over a day)
    const premium = BigNumber.from('100000000000000000000')
    const decreaseRate = BigNumber.from('1000000000000000')
    priceOracle = await deploy('LinearPremiumPriceOracle', dummyOracle.address, [0, 0, 4, 2, 1], premium, decreaseRate)

    ens = await deploy('UniversalRegistry')
    registrar = await deploy('EthRegistrar', ens.address, priceOracle.address, ZERO_ADDRESS)

    let tld = registrar.address.toLowerCase().substring(2)
    // sha3('eth') => sha3(tld)
    // namehash.hash('eth') => namehash.hash(tld)
    await ens.setSubnodeOwner(EMPTY_NODE, sha3(tld), registrar.address)
    await registrar.addController((await ethers.getSigners())[0].address)
  })

  it('should report the correct premium and decrease rate', async () => {
    assert.equal((await priceOracle.initialPremium()).toString(), '100000000000000000000')
    assert.equal((await priceOracle.premiumDecreaseRate()).toString(), '1000000000000000')
  })

  it('should return correct base prices', async () => {
    expect((await priceOracle.price('foo', 0, 3600)).base).to.equal(7200)

    expect((await priceOracle.price('quux', 0, 3600)).base).to.equal(3600)
    expect((await priceOracle.price('fubar', 0, 3600)).base).to.equal(1800)
    expect((await priceOracle.price('foobie', 0, 3600)).base).to.equal(1800)
  })

  it('should not specify a premium for first-time registrations', async () => {
    assert.equal((await priceOracle.premium('foobar', 0, 0)).toNumber(), 0)
    expect((await priceOracle.price('foobar', 0, 0)).base).to.equal(0)
  })

  it('should not specify a premium for renewals', async () => {
    const ts = +(await latest())
    assert.equal((await priceOracle.premium('foobar', ts, 0)).toNumber(), 0)
    expect((await priceOracle.price('foobar', ts, 0)).base).to.equal(0)
  })

  it('should specify the maximum premium at the moment of expiration', async () => {
    const ts = +(await latest()) - 90 * DAY
    assert.equal((await priceOracle.premium('foobar', ts, 0)).toString(), '50000000000000000000')
    assert.equal((await priceOracle.price('foobar', ts, 0)).premium.toString(), '50000000000000000000')
  })

  it('should specify half the premium after half the interval', async () => {
    const ts = +(await latest()) - (90 * DAY + 50000)
    assert.equal((await priceOracle.premium('foobar', ts, 0)).toString(), '25000000000000000000')
    assert.equal((await priceOracle.price('foobar', ts, 0)).premium.toString(), '25000000000000000000')
  })

  it('should return correct times for price queries', async () => {
    const initialPremiumWei = BigNumber.from('50000000000000000000')
    const ts = await priceOracle.timeUntilPremium(0, initialPremiumWei)
    assert.equal(ts.toNumber(), 90 * DAY)
    const ts2 = await priceOracle.timeUntilPremium(0, 0)
    assert.equal(ts2.toNumber(), 90 * DAY + 100000)
  })
})
