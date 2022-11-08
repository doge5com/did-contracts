const randomstring = require('randomstring')

import { UniversalRegistry, EthRegistrar, DummyMintPass, PassRegistrarController } from 'typechain-types'
import { assert, expect } from 'chai'
import {
  deploy,
  deployWithSpecialCreator,
  EMPTY_NODE,
  getBalance,
  getBlockTimestamp,
  getReverseNode,
  increaseTime,
  latest,
} from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

const { ethers } = require('hardhat')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('PassRegistrarController', () => {
  let ownerAccount: SignerWithAddress
  let accounts: SignerWithAddress[]
  let ens: UniversalRegistry
  let registrar: EthRegistrar
  let mintPass: DummyMintPass
  let passController: PassRegistrarController
  // old 'eth', now 'registrar addr'
  let tld

  before(async () => {
    accounts = await ethers.getSigners()
    ;[ownerAccount] = accounts

    ens = await deploy('UniversalRegistry')
    registrar = await deploy('EthRegistrar', ens.address, ZERO_ADDRESS, ZERO_ADDRESS)

    mintPass = await deploy('DummyMintPass', 'Pass', 'PASS', 'https://')

    passController = await deploy('PassRegistrarController', 50, ZERO_ADDRESS)

    await registrar.addController(passController.address)

    tld = registrar.address.toLowerCase().substring(2)
    await ens.setSubnodeOwner(EMPTY_NODE, sha3(tld), registrar.address)

    await passController.addSwapPair(mintPass.address, registrar.address)
  })

  it('pass swap', async () => {
    const startTokenId = 1
    const count = 50
    let names = []
    let tokenIds = []
    for (let i = 0; i < count; i++) {
      const registerName = randomstring.generate({
        length: 15,
        charset: 'abcdefg',
      })
      names.push(registerName)
      tokenIds.push(startTokenId + i)
    }

    await mintPass.batchMint(ownerAccount.address, startTokenId, names)
    await mintPass.setApprovalForAll(passController.address, true)
    await passController.passSwap(mintPass.address, tokenIds)
  })
})
