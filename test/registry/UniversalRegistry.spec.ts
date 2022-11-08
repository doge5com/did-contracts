import { TestRegistrar, UniversalRegistry } from 'typechain-types'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

import { assert, expect } from 'chai'
import { deploy, EMPTY_NODE } from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
const { ethers } = require('hardhat')

describe('UniversalRegistry', () => {
  let ens: UniversalRegistry
  let accounts: SignerWithAddress[]

  beforeEach(async () => {
    ens = await deploy('UniversalRegistry')
    accounts = await ethers.getSigners()
  })

  it('should allow ownership transfers', async () => {
    const addr = '0x0000000000000000000000000000000000001234'

    const setOwnerTx = await ens.setOwner(EMPTY_NODE, addr)

    assert.equal(await ens.owner(EMPTY_NODE), addr)

    const result = await setOwnerTx.wait()
    assert.equal(result.logs.length, 1)
    // let args = result.logs[0].args
    // assert.equal(args.node, '0x0000000000000000000000000000000000000000000000000000000000000000')
    // assert.equal(args.owner, addr)
  })

  it('should prohibit transfers by non-owners', async () => {
    await expect(ens.setOwner('0x1', '0x0000000000000000000000000000000000001234')).to.be.reverted
  })

  it('should allow setting resolvers', async () => {
    let addr = '0x0000000000000000000000000000000000001234'

    let setResolverTx = await ens.setResolver(EMPTY_NODE, addr)

    assert.equal(await ens.resolver(EMPTY_NODE), addr)

    const result = await setResolverTx.wait()

    assert.equal(result.logs.length, 1)
    // let args = result.logs[0].args
    // assert.equal(args.node, '0x0000000000000000000000000000000000000000000000000000000000000000')
    // assert.equal(args.resolver, addr)
  })

  it('should prevent setting resolvers by non-owners', async () => {
    await expect(ens.setResolver('0x1', '0x0000000000000000000000000000000000001234')).to.be.reverted
  })

  it('should allow setting the TTL', async () => {
    let setTTLTx = await ens.setTTL(EMPTY_NODE, 3600)

    assert.equal((await ens.ttl(EMPTY_NODE)).toNumber(), 3600)

    const result = await setTTLTx.wait()

    assert.equal(result.logs.length, 1)
    // let args = result.logs[0].args
    // assert.equal(args.node, '0x0000000000000000000000000000000000000000000000000000000000000000')
    // assert.equal(args.ttl.toNumber(), 3600)
  })

  it('should prevent setting the TTL by non-owners', async () => {
    await expect(ens.setTTL('0x1', 3600)).to.be.reverted
  })

  it('should allow the creation of subnodes', async () => {
    let setSubnodeOwnerTx = await ens.setSubnodeOwner(EMPTY_NODE, sha3('eth'), accounts[1].address)

    assert.equal(await ens.owner(namehash.hash('eth')), accounts[1].address)

    const result = await setSubnodeOwnerTx.wait()

    assert.equal(result.logs.length, 1)
    // let args = result.logs[0].args
    // assert.equal(args.node, '0x0000000000000000000000000000000000000000000000000000000000000000')
    // assert.equal(args.label, sha3('eth'))
    // assert.equal(args.owner, accounts[1])
  })

  it('should prohibit subnode creation by non-owners', async () => {
    await expect(ens.connect(accounts[1]).setSubnodeOwner(EMPTY_NODE, sha3('eth'), accounts[1].address)).to.be.reverted
  })
})
