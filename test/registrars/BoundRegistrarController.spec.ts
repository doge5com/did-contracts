import {
  BoundRegistrarController,
  DummyERC20,
  EthRegistrar,
  PublicResolver,
  ReverseRegistrar,
  StableCoinOracle,
  UniversalRegistry,
} from 'typechain-types'
import { deploy, EMPTY_NODE, getChainId, latest } from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const { ethers } = require('hardhat')

const DAYS = 24 * 60 * 60
const REGISTRATION_TIME = 365.2425 * DAYS
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAYS

describe('BoundRegistrarController', function () {
  let ens: UniversalRegistry
  let resolver: PublicResolver
  let registrar: EthRegistrar
  let controller: BoundRegistrarController
  let priceOracle: StableCoinOracle
  let reverseRegistrar: ReverseRegistrar
  let tld: string
  let erc20Currency: DummyERC20

  let feeRecipientAndIssuer: SignerWithAddress
  let ownerAccount: SignerWithAddress // Account that owns the registrar
  let registrantAccount: SignerWithAddress // Account that owns test names
  let accounts: SignerWithAddress[]
  let evmSnapshot: any

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
      registrar: registrar.address,
      owner: registrantAccount.address,
      resolver: resolver.address,
      currency: await priceOracle.currency(),
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

  async function registerName(name: string, txOptions = { value: BUFFERED_REGISTRATION_COST }) {
    const registerOrder = await signRegisterName(name)

    return await controller.register(registerOrder, txOptions)
  }

  before(async () => {
    accounts = await ethers.getSigners()
    ;[ownerAccount, registrantAccount, feeRecipientAndIssuer] = accounts

    ens = await deploy('UniversalRegistry')
    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    erc20Currency = await deploy('DummyERC20', 'USD', 'USD')
    priceOracle = await deploy('StableCoinOracle', erc20Currency.address, [0, 0, 4, 2, 1])

    registrar = await deploy('EthRegistrar', ens.address, priceOracle.address, feeRecipientAndIssuer.address)
    await registrar.setIssuer(feeRecipientAndIssuer.address)
    tld = registrar.address.toLowerCase().substring(2)
    await ens.setSubnodeOwner(EMPTY_NODE, sha3(tld), registrar.address)

    controller = await deploy('BoundRegistrarController', 0, 86400, ens.address)

    await registrar.addController(controller.address)
    await reverseRegistrar.addController(controller.address)

    resolver = await deploy('PublicResolver', ens.address, reverseRegistrar.address)

    await ens.connect(accounts[0]).setSubnodeOwner(EMPTY_NODE, sha3('reverse'), accounts[0].address)
    await ens.connect(accounts[0]).setSubnodeOwner(namehash.hash('reverse'), sha3('addr'), reverseRegistrar.address)

    await erc20Currency.approve(controller.address, '1000000000000000000')
  })

  beforeEach(async () => {
    evmSnapshot = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [evmSnapshot])
  })

  it('register name', async () => {
    await registerName('newname')
  })

  it('bulk register name', async () => {
    const count = 60
    let orders = []
    for (let i = 0; i < count; i++) {
      orders.push(await signRegisterName('newname' + i))
    }

    await controller.bulkRegister(
      orders
      // { value: BUFFERED_REGISTRATION_COST * count * 2 },
    )
  })
})
