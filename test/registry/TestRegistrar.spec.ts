import { UniversalRegistry, TestRegistrar } from 'typechain-types'
import { deploy, EMPTY_NODE, increaseTime } from '../helpers'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
const { ethers } = require('hardhat')

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

describe('TestRegistrar', () => {
  let node: string
  let registrar: TestRegistrar, ens: UniversalRegistry
  let accounts: SignerWithAddress[]

  beforeEach(async () => {
    node = namehash.hash('eth')
    ens = await deploy('UniversalRegistry')

    registrar = await deploy('TestRegistrar', ens.address, EMPTY_NODE)

    accounts = await ethers.getSigners()
    await ens.setOwner(EMPTY_NODE, registrar.address)
  })

  it('registers names', async () => {
    await registrar.register(sha3('eth'), accounts[0].address)
    assert.equal(await ens.owner(EMPTY_NODE), registrar.address)
    assert.equal(await ens.owner(node), accounts[0].address)
  })

  it('forbids transferring names within the test period', async () => {
    await registrar.register(sha3('eth'), accounts[1].address)
    await expect(registrar.register(sha3('eth'), accounts[0].address)).to.be.reverted
  })

  it('allows claiming a name after the test period expires', async () => {
    await registrar.register(sha3('eth'), accounts[1].address)
    assert.equal(await ens.owner(node), accounts[1].address)

    await increaseTime(28 * 24 * 60 * 60 + 1)

    await registrar.register(sha3('eth'), accounts[0].address)
    assert.equal(await ens.owner(node), accounts[0].address)
  })
})
