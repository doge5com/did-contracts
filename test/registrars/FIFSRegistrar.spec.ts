import { FIFSRegistrar, UniversalRegistry } from 'typechain-types'

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

describe('FIFSRegistrar', () => {
  let registrar: FIFSRegistrar, ens: UniversalRegistry
  let accounts: SignerWithAddress[]

  beforeEach(async () => {
    accounts = await ethers.getSigners()

    ens = await deploy('UniversalRegistry')

    registrar = await deploy('FIFSRegistrar', ens.address, EMPTY_NODE)

    await ens.setOwner(EMPTY_NODE, registrar.address)
  })

  it('should allow registration of names', async () => {
    await registrar.register(sha3('eth'), accounts[0].address)
    assert.equal(await ens.owner(EMPTY_NODE), registrar.address)
    assert.equal(await ens.owner(namehash.hash('eth')), accounts[0].address)
  })

  describe('transferring names', async () => {
    beforeEach(async () => {
      await registrar.register(sha3('eth'), accounts[0].address)
    })

    it('should allow transferring name to your own', async () => {
      await registrar.register(sha3('eth'), accounts[1].address)
      assert.equal(await ens.owner(namehash.hash('eth')), accounts[1].address)
    })

    it('forbids transferring the name you do not own', async () => {
      await expect(registrar.connect(accounts[1]).register(sha3('eth'), accounts[1].address)).to.be.reverted
    })
  })
})
