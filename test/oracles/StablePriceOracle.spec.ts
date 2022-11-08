import { DummyOracle, StablePriceOracle } from 'typechain-types'
import { deploy } from '../helpers'
import { BigNumber } from 'ethers'

const { expect } = require('chai')

describe('StablePriceOracle', () => {
  let priceOracle: StablePriceOracle

  before(async () => {
    // Dummy oracles with 1 ETH == 10 USD
    const dummyOracle = await deploy('DummyOracle', BigNumber.from(1000000000))
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    priceOracle = await deploy('StablePriceOracle', dummyOracle.address, [0, 0, 4, 2, 1])
  })

  it('should return correct prices', async () => {
    expect((await priceOracle.price('foo', 0, 3600)).base).to.equal(1440)
    expect((await priceOracle.price('quux', 0, 3600)).base).to.equal(720)
    expect((await priceOracle.price('fubar', 0, 3600)).base).to.equal(360)
    expect((await priceOracle.price('foobie', 0, 3600)).base).to.equal(360)
  })

  it('should work with larger values', async () => {
    const dummyOracle2 = await deploy('DummyOracle', 1000000000)
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    const priceOracle2 = await deploy('StablePriceOracle', dummyOracle2.address, [
      0,
      0,
      // 1 USD per second!
      BigNumber.from('1000000000000000000'),
      2,
      1,
    ])
    expect((await priceOracle2.price('foo', 0, 86400))[1]).to.equal(BigNumber.from('8640000000000000000000'))
  })
})

process.on('warning', (warning) => {
  console.log(warning.stack)
})
