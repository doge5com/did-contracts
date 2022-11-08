import { EthRegistrar, UniversalRegistry } from 'typechain-types'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

import { assert, expect } from 'chai'
import {
  advanceBlock,
  deploy,
  deployWithSpecialCreator,
  EMPTY_NODE,
  getBlockTimestamp,
  increaseTime,
  latest,
} from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
const { ethers } = require('hardhat')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('EthRegistrar', () => {
  let ownerAccount: SignerWithAddress
  let controllerAccount: SignerWithAddress
  let registrantAccount: SignerWithAddress
  let otherAccount: SignerWithAddress

  let ens: UniversalRegistry
  let registrar: EthRegistrar
  // old 'eth', now 'registrar addr'
  let tld: string

  before(async () => {
    ens = await deploy('UniversalRegistry')
    ;[ownerAccount, controllerAccount, registrantAccount, otherAccount] = await ethers.getSigners()

    registrar = await deployWithSpecialCreator('EthRegistrar', ownerAccount, ens.address, ZERO_ADDRESS, ZERO_ADDRESS)
    await registrar.connect(ownerAccount).addController(controllerAccount.address)

    tld = registrar.address.toLowerCase().substring(2)
    await ens.setSubnodeOwner(EMPTY_NODE, sha3(tld), registrar.address)
  })

  it('should allow new registrations', async () => {
    const tx = await registrar
      .connect(controllerAccount)
      .register('newname', registrantAccount.address, 86400, ZERO_ADDRESS)
    const registerTimestamp = await getBlockTimestamp((await tx.wait()).blockNumber)
    assert.equal(await ens.owner(namehash.hash('newname.' + tld)), registrantAccount.address)
    const tokenId = await registrar.tokenOf(sha3('newname'))
    assert.equal(await registrar.ownerOf(tokenId), registrantAccount.address)
    assert.equal((await registrar.nameExpires(sha3('newname'))).toNumber(), registerTimestamp + 86400)
  })

  it('should allow renewals', async () => {
    const oldExpires = await registrar.nameExpires(sha3('newname'))
    await registrar.connect(controllerAccount).renew(sha3('newname'), 86400)
    assert.equal(
      (await registrar.nameExpires(sha3('newname'))).toNumber(),
      oldExpires.add(BigNumber.from(86400)).toNumber()
    )
  })

  it('should only allow the controller to register', async () => {
    await expect(registrar.connect(otherAccount).register(sha3('foo'), otherAccount.address, 86400, ZERO_ADDRESS)).to.be
      .reverted
  })

  it('should only allow the controller to renew', async () => {
    await expect(registrar.connect(otherAccount).renew(sha3('newname'), 86400)).to.be.reverted
  })

  it('should not permit registration of already registered names', async () => {
    await expect(registrar.connect(controllerAccount).register('newname', otherAccount.address, 86400, ZERO_ADDRESS)).to
      .be.reverted
    const tokenId = await registrar.tokenOf(sha3('newname'))
    assert.equal(await registrar.ownerOf(tokenId), registrantAccount.address)
  })

  it('should not permit renewing a name that is not registered', async () => {
    await expect(registrar.connect(controllerAccount).renew(sha3('name3'), 86400)).to.be.reverted
  })

  it('should permit the owner to reclaim a name', async () => {
    await ens.setSubnodeOwner(ZERO_HASH, sha3(tld), ownerAccount.address)
    await ens.setSubnodeOwner(namehash.hash(tld), sha3('newname'), ZERO_ADDRESS)
    assert.equal(await ens.owner(namehash.hash('newname.' + tld)), ZERO_ADDRESS)
    await ens.setSubnodeOwner(ZERO_HASH, sha3(tld), registrar.address)
    await registrar.connect(registrantAccount).reclaim(sha3('newname'), registrantAccount.address)
    assert.equal(await ens.owner(namehash.hash('newname.' + tld)), registrantAccount.address)
  })

  it('should prohibit anyone else from reclaiming a name', async () => {
    await expect(registrar.connect(otherAccount).reclaim(sha3('newname'), registrantAccount.address)).to.be.reverted
  })

  it('should permit the owner to transfer a registration', async () => {
    const tokenId = await registrar.tokenOf(sha3('newname'))
    await registrar.connect(registrantAccount).transferFrom(registrantAccount.address, otherAccount.address, tokenId)
    assert.equal(await registrar.ownerOf(tokenId), otherAccount.address)
    // Transfer does not update ENS without a call to reclaim.
    assert.equal(await ens.owner(namehash.hash('newname.' + tld)), otherAccount.address)
    await registrar.connect(otherAccount).transferFrom(otherAccount.address, registrantAccount.address, tokenId)
  })

  it('should prohibit anyone else from transferring a registration', async () => {
    await expect(
      registrar.connect(otherAccount).transferFrom(otherAccount.address, otherAccount.address, sha3('newname'))
    ).to.be.reverted
  })

  it('should not permit transfer or reclaim during the grace period', async () => {
    // Advance to the grace period
    const ts = +(await latest())
    await increaseTime((await registrar.nameExpires(sha3('newname'))).toNumber() - ts + 3600)
    await advanceBlock()
    await expect(
      registrar
        .connect(registrantAccount)
        .transferFrom(registrantAccount.address, otherAccount.address, sha3('newname'))
    ).to.be.reverted
    await expect(registrar.connect(registrantAccount).reclaim(sha3('newname'), registrantAccount.address)).to.be
      .reverted
  })

  it('should allow renewal during the grace period', async () => {
    await registrar.connect(controllerAccount).renew(sha3('newname'), 86400)
  })

  it('should allow registration of an expired domain', async () => {
    const ts = +(await latest())
    const expires = await registrar.nameExpires(sha3('newname'))
    const grace = await registrar.GRACE_PERIOD()
    await increaseTime(expires.toNumber() - ts + grace.toNumber() + 3600)

    const tokenId = await registrar.tokenOf(sha3('newname'))
    try {
      await registrar.ownerOf(tokenId)
      assert.fail('should throw an exception')
    } catch (error) {}

    await registrar.connect(controllerAccount).register('newname', otherAccount.address, 86400, ZERO_ADDRESS)
    assert.equal(await registrar.ownerOf(tokenId), otherAccount.address)
  })

  it('should allow the owner to set a resolver address', async () => {
    await registrar.connect(ownerAccount).setResolver(controllerAccount.address)
    assert.equal(await ens.resolver(namehash.hash(tld)), controllerAccount.address)
  })
})
