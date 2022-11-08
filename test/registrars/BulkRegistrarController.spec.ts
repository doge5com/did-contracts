import {
  UniversalRegistry,
  PublicResolver,
  EthRegistrar,
  CommonRegistrarController,
  BoundRegistrarController,
  DummyOracle,
  StablePriceOracle,
  BulkRegistrarController,
} from 'typechain-types'
import { assert, expect } from 'chai'
import { deploy, deployWithSpecialCreator, EMPTY_NODE, getBalance, getChainId, latest } from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const { ethers } = require('hardhat')

const DAYS = 24 * 60 * 60
const REGISTRATION_TIME = 365.2425 * DAYS
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAYS

describe('BulkRegistrarController', () => {
  let ens: UniversalRegistry
  let resolver: PublicResolver
  let ethRegistrar: EthRegistrar
  let controller: CommonRegistrarController
  let boundController: BoundRegistrarController
  let priceOracle: StablePriceOracle
  let bulkController: BulkRegistrarController

  let ETH_LABEL
  let ETH_NAMEHASH

  let feeRecipientAndIssuer: SignerWithAddress
  let ownerAccount: SignerWithAddress // Account that owns the registrar
  let registrantAccount: SignerWithAddress // Account that owns test names
  let accounts: SignerWithAddress[]

  const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

  async function registerSigWith712Data(registerOrder: any) {
    const chainId = getChainId()
    const domain = {
      name: 'RegistrarController',
      version: '1',
      chainId: chainId,
      verifyingContract: controller.address,
    }
    const types = {
      RegisterOrder: [
        {
          name: 'issuer',
          type: 'address',
        },
        {
          name: 'registrar',
          type: 'address',
        },
        {
          name: 'owner',
          type: 'address',
        },
        {
          name: 'resolver',
          type: 'address',
        },
        {
          name: 'currency',
          type: 'address',
        },
        {
          name: 'duration',
          type: 'uint256',
        },
        {
          name: 'applyingTime',
          type: 'uint256',
        },
        {
          name: 'name',
          type: 'bytes',
        },
        {
          name: 'params',
          type: 'bytes',
        },
      ],
    }
    const digest = await feeRecipientAndIssuer._signTypedData(domain, types, registerOrder)
    return ethers.utils.splitSignature(digest)
  }

  async function signRegisterName(name: string) {
    const timestamp = await latest()
    const registerOrder: any = {
      issuer: feeRecipientAndIssuer.address,
      registrar: ethRegistrar.address,
      owner: ownerAccount,
      resolver: resolver.address,
      currency: await controller.NATIVE_TOKEN_ADDRESS(),
      duration: REGISTRATION_TIME,
      applyingTime: timestamp,
      name: Buffer.from(name),
      params: '0x',
    }

    const registerSig = await registerSigWith712Data(registerOrder)
    registerOrder.v = registerSig.v
    registerOrder.r = registerSig.r
    registerOrder.s = registerSig.s

    return registerOrder
  }

  before(async () => {
    accounts = await ethers.getSigners()
    ;[ownerAccount, registrantAccount, feeRecipientAndIssuer] = accounts

    // Create a registry
    ens = await deploy('UniversalRegistry')
    // Create a public resolver
    resolver = await deploy('PublicResolver', ens.address, EMPTY_ADDRESS)

    // Set up a dummy price oracles and a controller
    const dummyOracle = await deploy('DummyOracle', BigNumber.from(100000000))
    priceOracle = await deploy('StablePriceOracle', dummyOracle.address, [0, 0, 4, 2, 1])
    // Create a base registrar
    ethRegistrar = await deployWithSpecialCreator(
      'EthRegistrar',
      ownerAccount,
      ens.address,
      priceOracle.address,
      EMPTY_ADDRESS
    )
    await ethRegistrar.setIssuer(feeRecipientAndIssuer.address)

    controller = await deployWithSpecialCreator(
      'CommonRegistrarController',
      ownerAccount,
      0,
      86400,
      ens.address,
      EMPTY_ADDRESS
    )
    boundController = await deployWithSpecialCreator('BoundRegistrarController', ownerAccount, 0, 86400, ens.address)

    await ethRegistrar.connect(ownerAccount).addController(controller.address)
    await ethRegistrar.connect(ownerAccount).addController(boundController.address)
    await ethRegistrar.connect(ownerAccount).addController(ownerAccount.address)
    ETH_LABEL = sha3(ethRegistrar.address.substring(2).toLowerCase())
    ETH_NAMEHASH = namehash.hash(ethRegistrar.address.substring(2).toLowerCase())

    // Create the bulk registration contract
    bulkController = await deploy('BulkRegistrarController', ens.address)

    // Configure a resolver for .eth and register the controller interface
    // then transfer the .eth node to the base registrar.
    await ens.setSubnodeRecord(EMPTY_NODE, ETH_LABEL, ownerAccount.address, resolver.address, 0)
    const interfaceId = await bulkController.controllerInterfaceId()
    await resolver.setInterface(ETH_NAMEHASH, interfaceId, boundController.address)
    await ens.setOwner(ETH_NAMEHASH, ethRegistrar.address)

    // Register some names
    for (const name of ['test1', 'test2', 'test3']) {
      await ethRegistrar.register(name, registrantAccount.address, 31536000, EMPTY_ADDRESS)
    }
  })

  it('should return the cost of a bulk renewal', async () => {
    await bulkController.rentPrice([ethRegistrar.address, ethRegistrar.address], ['test1', 'test2'], [86400, 86400])
  })

  it('should raise an error trying to renew a nonexistent name', async () => {
    await expect(bulkController.bulkRenew([ethRegistrar.address], ['foobar'], [86400])).to.be.reverted
  })

  it('should permit bulk renewal of names', async () => {
    const oldExpiry = await ethRegistrar.nameExpires(sha3('test2'))
    await bulkController.bulkRenew([ethRegistrar.address, ethRegistrar.address], ['test1', 'test2'], [86400, 86400], {
      value: 86401 * 2,
    })
    const newExpiry = await ethRegistrar.nameExpires(sha3('test2'))
    assert.equal(newExpiry.sub(oldExpiry).toNumber(), 86400)
    // Check any excess funds are returned
    assert.equal(await getBalance(bulkController.address), 0)
  })
})
