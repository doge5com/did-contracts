import {
  DummyERC20,
  EthRegistrar,
  MixedRegistrarController,
  PublicResolver,
  ReverseRegistrar,
  StableCoinOracle,
  UniversalRegistry,
  Voucher,
} from 'typechain-types'
import { deploy, deployProxy, EMPTY_NODE, getChainId, latest } from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const { ethers } = require('hardhat')

const DAYS = 24 * 60 * 60
const REGISTRATION_TIME = 365.2425 * DAYS
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAYS
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('MixedRegistrarController', function () {
  let ens: UniversalRegistry
  let resolver: PublicResolver
  let registrar: EthRegistrar
  let mixedController: MixedRegistrarController
  let priceOracle: StableCoinOracle
  let reverseRegistrar: ReverseRegistrar
  let tld: string
  let erc20Currency: DummyERC20
  let voucher: Voucher
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
      verifyingContract: mixedController.address,
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

  async function signRegisterName(name: string, params = '0x') {
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
      params: params,
    }

    const registerSig = await registerSigWith712Data(registerOrder)
    registerOrder.v = registerSig.v
    registerOrder.r = registerSig.r
    registerOrder.s = registerSig.s

    // console.log(registerOrder)

    return registerOrder
  }

  async function registerName(name: string, params = '0x', txOptions = { value: BUFFERED_REGISTRATION_COST }) {
    const registerOrder = await signRegisterName(name, params)
    return await mixedController.register(registerOrder, txOptions)
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

    voucher = await deployProxy('Voucher', ['Voucher', 'VOUCHER', 'https://'], { initializer: 'initialize' })
    mixedController = await deployProxy('MixedRegistrarController', [0, 86400], {
      initializer: 'initialize',
    })

    resolver = await deploy('PublicResolver', ens.address, reverseRegistrar.address)

    await registrar.addController(mixedController.address)
    await reverseRegistrar.addController(mixedController.address)
    await ens.connect(accounts[0]).setSubnodeOwner(EMPTY_NODE, sha3('reverse'), accounts[0].address)
    await ens.connect(accounts[0]).setSubnodeOwner(namehash.hash('reverse'), sha3('addr'), reverseRegistrar.address)
    await erc20Currency.approve(mixedController.address, '1000000000000000000')
    const voucherId = (await voucher.tokenIdTracker()).toString()
    await voucher.createVoucher(
      {
        effect: 0,
        vtype: 0,
        discount: 0,
        isAll: false,
        isPermanent: true,
        expiredAt: 0,
        strlen: 3,
      },
      [registrar.address]
    )
    await voucher.grantRole(ethers.utils.keccak256(Buffer.from('TRANSFER_ROLE')), mixedController.address)
    await mixedController.setVoucher(voucher.address, voucherId, true)
  })

  beforeEach(async () => {
    evmSnapshot = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [evmSnapshot])
  })

  it('cyptocurrency register name', async () => {
    await registerName('newname')
  })

  it('voucher register name', async () => {
    await voucher.mint(ownerAccount.address, 0, 1, '0x')
    await voucher.setApprovalForAll(mixedController.address, true)
    const params = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256'], // encode as address array
      [voucher.address, 0]
    ) // array to encode
    await registerName('newname', params)
  })

  it('bulk cyptocurrency register name', async () => {
    const count = 60
    let orders = []
    for (let i = 0; i < count; i++) {
      orders.push(await signRegisterName('newname' + i))
    }

    await mixedController.bulkRegister(orders, [{ token: erc20Currency.address, amount: '100000' }], [])
  })
})
