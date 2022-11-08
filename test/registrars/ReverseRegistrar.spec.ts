const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

import { PublicResolver, PublicResolver__factory, ReverseRegistrar, UniversalRegistry } from 'typechain-types'

import { assert, expect } from 'chai'
import {
  advanceBlock,
  deploy,
  deployWithSpecialCreator,
  EMPTY_NODE,
  getBlockTimestamp,
  getReverseNode,
  increaseTime,
  latest,
} from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
const { ethers } = require('hardhat')

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('ReverseRegistrar', () => {
  let accounts: SignerWithAddress[]
  let node: string, node2: string, node3: string, dummyOwnableReverseNode: string

  let registrar: ReverseRegistrar,
    resolver: PublicResolver,
    ens: UniversalRegistry,
    dummyOwnable: ReverseRegistrar,
    defaultResolver: PublicResolver

  beforeEach(async () => {
    accounts = await ethers.getSigners()
    node = getReverseNode(accounts[0].address)
    node2 = getReverseNode(accounts[1].address)
    node3 = getReverseNode(accounts[2].address)
    ens = await deploy('UniversalRegistry')
    registrar = await deploy('ReverseRegistrar', ens.address)
    resolver = await deploy('PublicResolver', ens.address, registrar.address)
    await registrar.setDefaultResolver(resolver.address)

    defaultResolver = PublicResolver__factory.connect(await registrar.defaultResolver(), ethers.provider)
    dummyOwnable = await deploy('ReverseRegistrar', ens.address)
    dummyOwnableReverseNode = getReverseNode(dummyOwnable.address)

    await ens.connect(accounts[0]).setSubnodeOwner(EMPTY_NODE, sha3('reverse'), accounts[0].address)
    await ens.setSubnodeOwner(namehash.hash('reverse'), sha3('addr'), registrar.address)
  })

  it('should calculate node hash correctly', async () => {
    assert.equal(await registrar.node(accounts[0].address), node)
  })

  describe('claim', () => {
    it('allows an account to claim its address', async () => {
      await registrar.claim(accounts[1].address)
      assert.equal(await ens.owner(node), accounts[1].address)
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(registrar.claim(accounts[1].address))
        .to.emit(registrar, 'ReverseClaimed')
        .withArgs(accounts[0].address, node)
    })
  })

  describe('claimForAddr', () => {
    it('allows an account to claim its address', async () => {
      await registrar.claimForAddr(accounts[0].address, accounts[1].address, resolver.address)
      assert.equal(await ens.owner(node), accounts[1].address)
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(registrar.claimForAddr(accounts[0].address, accounts[1].address, resolver.address))
        .to.emit(registrar, 'ReverseClaimed')
        .withArgs(accounts[0].address, node)
    })

    it('forbids an account to claim another address', async () => {
      await expect(registrar.claimForAddr(accounts[1].address, accounts[0].address, resolver.address)).to.be.reverted
    })

    it('allows an authorised account to claim a different address', async () => {
      await ens.connect(accounts[1]).setApprovalForAll(accounts[0].address, true)
      await registrar.claimForAddr(accounts[1].address, accounts[2].address, resolver.address)
      assert.equal(await ens.owner(node2), accounts[2].address)
    })

    it('allows a controller to claim a different address', async () => {
      await registrar.addController(accounts[0].address)
      await registrar.claimForAddr(accounts[1].address, accounts[2].address, resolver.address)
      assert.equal(await ens.owner(node2), accounts[2].address)
    })

    it('allows an owner() of a contract to claim the reverse node of that contract', async () => {
      await registrar.addController(accounts[0].address)
      await registrar.claimForAddr(dummyOwnable.address, accounts[0].address, resolver.address)
      assert.equal(await ens.owner(dummyOwnableReverseNode), accounts[0].address)
    })
  })

  describe('claimWithResolver', () => {
    it('allows an account to specify resolver', async () => {
      await registrar.claimWithResolver(accounts[1].address, accounts[2].address)
      assert.equal(await ens.owner(node), accounts[1].address)
      assert.equal(await ens.resolver(node), accounts[2].address)
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(registrar.claimWithResolver(accounts[1].address, accounts[2].address))
        .to.emit(registrar, 'ReverseClaimed')
        .withArgs(accounts[0].address, node)
    })
  })

  describe('setName', () => {
    it('sets name records', async () => {
      await registrar.setName('testname')
      assert.equal(await ens.resolver(node), defaultResolver.address)
      assert.equal(await defaultResolver.name(node), 'testname')
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(await registrar.setName('testname'))
        .to.emit(registrar, 'ReverseClaimed')
        .withArgs(accounts[0].address, node)
    })
  })

  describe('setNameForAddr', () => {
    it('allows controller to set name records for other accounts', async () => {
      await registrar.addController(accounts[0].address)
      await registrar.setNameForAddr(accounts[1].address, accounts[0].address, resolver.address, 'testname')
      assert.equal(await ens.resolver(node2), resolver.address)
      assert.equal(await resolver.name(node2), 'testname')
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(registrar.setNameForAddr(accounts[0].address, accounts[0].address, resolver.address, 'testname'))
        .to.emit(registrar, 'ReverseClaimed')
        .withArgs(accounts[0].address, node)
    })

    it('forbids non-controller if address is different from sender and not authorised', async () => {
      await expect(registrar.setNameForAddr(accounts[1].address, accounts[0].address, resolver.address, 'testname')).to
        .be.reverted
    })

    it('allows name to be set for an address if the sender is the address', async () => {
      await registrar.setNameForAddr(accounts[0].address, accounts[0].address, resolver.address, 'testname')
      assert.equal(await ens.resolver(node), resolver.address)
      assert.equal(await resolver.name(node), 'testname')
    })

    it('allows name to be set for an address if the sender is authorised', async () => {
      await ens.setApprovalForAll(accounts[1].address, true)
      await registrar
        .connect(accounts[1])
        .setNameForAddr(accounts[0].address, accounts[0].address, resolver.address, 'testname')
      assert.equal(await ens.resolver(node), resolver.address)
      assert.equal(await resolver.name(node), 'testname')
    })

    it('allows an owner() of a contract to claimWithResolverForAddr on behalf of the contract', async () => {
      await registrar.setNameForAddr(dummyOwnable.address, accounts[0].address, resolver.address, 'dummyownable.eth')
      assert.equal(await ens.owner(dummyOwnableReverseNode), accounts[0].address)
      assert.equal(await resolver.name(dummyOwnableReverseNode), 'dummyownable.eth')
    })
  })
})
