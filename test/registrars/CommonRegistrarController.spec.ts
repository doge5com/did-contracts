import {
  CommonRegistrarController,
  DummyOracle,
  EthRegistrar,
  PublicResolver,
  ReverseRegistrar,
  StablePriceOracle,
  UniversalRegistry,
} from 'typechain-types'
import { expect } from 'chai'
import { deploy, getBalance, getBlockTimestamp, getReverseNode, increaseTime, latest } from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

const { ethers } = require('hardhat')

const DAYS = 24 * 60 * 60
const REGISTRATION_TIME = 365.2425 * DAYS
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAYS
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('CommonRegistrarController', function () {
  let ens: UniversalRegistry
  let resolver: PublicResolver
  let registrar: EthRegistrar
  let controller: CommonRegistrarController
  let priceOracle: StablePriceOracle
  let reverseRegistrar: ReverseRegistrar
  let tld: string
  let feeRecipient: string
  const secret = '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
  let ownerAccount: SignerWithAddress // Account that owns the registrar
  let registrantAccount: SignerWithAddress // Account that owns test names
  let accounts: SignerWithAddress[]
  let evmSnapshot: any

  async function registerName(name: string, txOptions = { value: BUFFERED_REGISTRATION_COST }) {
    const commitment = await controller.makeCommitment(
      name,
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      []
    )
    await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await latest())

    await increaseTime((await controller.minCommitmentAge()).toNumber())

    return await controller.register(
      name,
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      registrar.address,
      txOptions
    )
  }

  before(async () => {
    accounts = await ethers.getSigners()
    ;[ownerAccount, registrantAccount] = accounts

    ens = await deploy('UniversalRegistry')

    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    const dummyOracle = await deploy('DummyOracle', '100000000')
    priceOracle = await deploy('StablePriceOracle', dummyOracle.address, [0, 0, 4, 2, 1])

    feeRecipient = NULL_ADDRESS
    registrar = await deploy('EthRegistrar', ens.address, priceOracle.address, feeRecipient)
    tld = registrar.address.toLowerCase().substring(2)
    await ens.setSubnodeOwner(EMPTY_BYTES, sha3(tld), registrar.address)

    controller = await deploy('CommonRegistrarController', 600, 86400, ens.address, reverseRegistrar.address)

    await registrar.addController(controller.address)
    await reverseRegistrar.addController(controller.address)

    // let token = await deploy('DummyERC20')
    // const amount = ethers.utils.parseUnits('100000', 'ether')
    // token.approve(controller.address, amount)
    // token.connect(signers[1]).transfer(signers[1], amount)
    // token.connect(signers[1]).approve(controller.address, amount)

    resolver = await deploy('PublicResolver', ens.address, reverseRegistrar.address)
    await resolver.addController(controller.address)

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0].address)
    await ens.setSubnodeOwner(namehash.hash('reverse'), sha3('addr'), reverseRegistrar.address)
  })

  beforeEach(async () => {
    evmSnapshot = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [evmSnapshot])
  })

  const checkLabels: { [key: string]: boolean } = {
    testing: true,
    longname12345678: true,
    sixsix: true,
    five5: true,
    four: true,
    iii: true,
    ii: false,
    i: false,
    '': false,

    // { ni } { hao } { ma } (chinese; simplified)
    你好吗: true,

    // { ta } { ko } (japanese; hiragana)
    たこ: false,

    // { poop } { poop } { poop } (emoji)
    '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

    // { poop } { poop } (emoji)
    '\ud83d\udca9\ud83d\udca9': false,
  }

  it('should report label validity', async () => {
    for (const label in checkLabels) {
      expect(await controller.valid(label)).to.equal(checkLabels[label], label)
    }
  })

  it('should report unused names as available', async () => {
    expect(await controller.available(registrar.address, sha3('available'))).to.equal(true)
  })

  it('should permit new registrations', async () => {
    const name = 'newname'
    const balanceBefore = await getBalance(feeRecipient)
    const tx = await registerName(name)
    const blockTimestamp = await getBlockTimestamp((await tx.wait()).blockNumber)
    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        registrar.address,
        sha3(name),
        name,
        registrantAccount.address,
        1,
        REGISTRATION_TIME,
        blockTimestamp + REGISTRATION_TIME
      )

    expect((await getBalance(feeRecipient)) - balanceBefore).to.equal(REGISTRATION_TIME)
  })

  it('should revert when not enough funds is transferred', async () => {
    await expect(registerName('newname', { value: 0 })).to.be.revertedWith(
      'RegistrarController: Not enough funds provided'
    )
  })

  it('should report registered names as unavailable', async () => {
    const name = 'newname'
    await registerName(name)
    expect(await controller.available(registrar.address, name)).to.equal(false)
  })

  it('should permit new registrations with resolver and records', async () => {
    var commitment = await controller.makeCommitment(
      'newconfigname',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [
        resolver.interface.encodeFunctionData('setAddr', [
          namehash.hash('newconfigname.' + tld),
          registrantAccount.address,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash.hash('newconfigname.' + tld),
          'url',
          'ethereum.com',
        ]),
      ]
    )
    var tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await getBlockTimestamp((await tx.wait()).blockNumber))

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    var balanceBefore = await getBalance(feeRecipient)
    var tx = await controller.register(
      'newconfigname',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [
        resolver.interface.encodeFunctionData('setAddr', [
          namehash.hash('newconfigname.' + tld),
          registrantAccount.address,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash.hash('newconfigname.' + tld),
          'url',
          'ethereum.com',
        ]),
      ],
      registrar.address,
      { value: BUFFERED_REGISTRATION_COST }
    )

    const blockTimestamp = await getBlockTimestamp((await tx.wait()).blockNumber)

    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        registrar.address,
        sha3('newconfigname'),
        'newconfigname',
        registrantAccount.address,
        1,
        REGISTRATION_TIME,
        blockTimestamp + REGISTRATION_TIME
      )

    expect((await getBalance(feeRecipient)) - balanceBefore).to.equal(REGISTRATION_TIME)

    var nodehash = namehash.hash('newconfigname.' + tld)
    expect(await ens.resolver(nodehash)).to.equal(resolver.address)
    expect(await resolver.addr(nodehash)).to.equal(registrantAccount.address)
    expect(await resolver.text(nodehash, 'url')).to.equal('ethereum.com')
  })

  it('should not permit new registrations with 0 resolver', async () => {
    await expect(
      controller.makeCommitment('newconfigname', registrantAccount.address, REGISTRATION_TIME, secret, NULL_ADDRESS, [
        resolver.interface.encodeFunctionData('setAddr', [
          namehash.hash('newconfigname.' + tld),
          registrantAccount.address,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash.hash('newconfigname.' + tld),
          'url',
          'ethereum.com',
        ]),
      ])
    ).to.be.revertedWith('RegistrarController: Resolver is required when data is supplied')
  })

  it('should not permit new registrations with EoA resolver', async () => {
    const commitment = await controller.makeCommitment(
      'newconfigname',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      registrantAccount.address,
      [
        resolver.interface.encodeFunctionData('setAddr', [
          namehash.hash('newconfigname.' + tld),
          registrantAccount.address,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash.hash('newconfigname.' + tld),
          'url',
          'ethereum.com',
        ]),
      ]
    )

    const tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await getBlockTimestamp((await tx.wait()).blockNumber))

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        'newconfigname',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        registrantAccount.address,
        [
          resolver.interface.encodeFunctionData('setAddr', [
            namehash.hash('newconfigname.' + tld),
            registrantAccount.address,
          ]),
          resolver.interface.encodeFunctionData('setText', [
            namehash.hash('newconfigname.' + tld),
            'url',
            'ethereum.com',
          ]),
        ],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )
    ).to.be.revertedWith('Address: call to non-contract')
  })

  it('should not permit new registrations with an incompatible contract', async () => {
    const commitment = await controller.makeCommitment(
      'newconfigname',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      controller.address,
      [
        resolver.interface.encodeFunctionData('setAddr', [
          namehash.hash('newconfigname.' + tld),
          registrantAccount.address,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash.hash('newconfigname.' + tld),
          'url',
          'ethereum.com',
        ]),
      ]
    )

    const tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await getBlockTimestamp((await tx.wait()).blockNumber))

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        'newconfigname',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        controller.address,
        [
          resolver.interface.encodeFunctionData('setAddr', [
            namehash.hash('newconfigname.' + tld),
            registrantAccount.address,
          ]),
          resolver.interface.encodeFunctionData('setText', [
            namehash.hash('newconfigname.' + tld),
            'url',
            'ethereum.com',
          ]),
        ],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )
    ).to.be.revertedWith('RegistrarController: Failed to set Record')
  })

  it('should not permit new registrations with records updating a different name', async () => {
    const commitment = await controller.makeCommitment(
      'awesome',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [resolver.interface.encodeFunctionData('setAddr', [namehash.hash('othername.' + tld), registrantAccount.address])]
    )
    const tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await getBlockTimestamp((await tx.wait()).blockNumber))

    await increaseTime((await controller.minCommitmentAge()).toNumber())

    await expect(
      controller.register(
        'awesome',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr', [
            namehash.hash('othername.' + tld),
            registrantAccount.address,
          ]),
        ],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )
    ).to.be.revertedWith('RegistrarController: Namehash on record do not match the name being registered')
  })

  it('should not permit new registrations with any record updating a different name', async () => {
    const commitment = await controller.makeCommitment(
      'awesome',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [
        resolver.interface.encodeFunctionData('setAddr', [namehash.hash('awesome.' + tld), registrantAccount.address]),
        resolver.interface.encodeFunctionData('setText', [namehash.hash('other.' + tld), 'url', 'ethereum.com']),
      ]
    )
    const tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await getBlockTimestamp((await tx.wait()).blockNumber))

    await increaseTime((await controller.minCommitmentAge()).toNumber())

    await expect(
      controller.register(
        'awesome',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr', [
            namehash.hash('awesome.' + tld),
            registrantAccount.address,
          ]),
          resolver.interface.encodeFunctionData('setText', [namehash.hash('other.' + tld), 'url', 'ethereum.com']),
        ],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )
    ).to.be.revertedWith('RegistrarController: Namehash on record do not match the name being registered')
  })

  it('should permit a registration with resolver but no records', async () => {
    const commitment = await controller.makeCommitment(
      'newconfigname2',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      []
    )
    let tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(await getBlockTimestamp((await tx.wait()).blockNumber))

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    const balanceBefore = await getBalance(feeRecipient)
    let tx2 = await controller.register(
      'newconfigname2',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      registrar.address,
      { value: BUFFERED_REGISTRATION_COST }
    )

    const blockTimestamp = await getBlockTimestamp((await tx2.wait()).blockNumber)

    await expect(tx2)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        registrar.address,
        sha3('newconfigname2'),
        'newconfigname2',
        registrantAccount.address,
        1,
        REGISTRATION_TIME,
        blockTimestamp + REGISTRATION_TIME
      )

    const nodehash = namehash.hash('newconfigname2.' + tld)
    expect(await ens.resolver(nodehash)).to.equal(resolver.address)
    expect(await resolver.addr(nodehash)).to.equal(NULL_ADDRESS)
    expect((await getBalance(feeRecipient)) - balanceBefore).to.equal(REGISTRATION_TIME)
  })

  it('should include the owner in the commitment', async () => {
    await controller.commit(
      await controller.makeCommitment('newname2', accounts[2].address, REGISTRATION_TIME, secret, NULL_ADDRESS, [])
    )

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        'newname2',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        registrar.address,
        {
          value: BUFFERED_REGISTRATION_COST,
        }
      )
    ).to.be.reverted
  })

  it('should reject duplicate registrations', async () => {
    await registerName('newname')
    await controller.commit(
      await controller.makeCommitment('newname', registrantAccount.address, REGISTRATION_TIME, secret, NULL_ADDRESS, [])
    )

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    expect(
      controller.register(
        'newname',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        registrar.address,
        {
          value: BUFFERED_REGISTRATION_COST,
        }
      )
    ).to.be.revertedWith('RegistrarController: Name is unavailable')
  })

  it('should reject for expired commitments', async () => {
    await controller.commit(
      await controller.makeCommitment(
        'newname2',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        []
      )
    )

    await increaseTime((await controller.maxCommitmentAge()).toNumber() + 1)
    expect(
      controller.register(
        'newname2',
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        registrar.address,
        {
          value: BUFFERED_REGISTRATION_COST,
        }
      )
    ).to.be.revertedWith('RegistrarController: Commitment has expired')
  })

  it('should allow anyone to renew a name', async () => {
    await registerName('newname')
    var expires = await registrar.nameExpires(sha3('newname'))
    var balanceBefore = await getBalance(feeRecipient)
    const duration = 86400
    const [, price] = await controller.rentPrice(registrar.address, sha3('newname'), duration)
    await controller.renew(registrar.address, 'newname', duration, { value: price })
    var newExpires = await registrar.nameExpires(sha3('newname'))
    expect(newExpires.toNumber() - expires.toNumber()).to.equal(86400)
    expect((await getBalance(feeRecipient)) - balanceBefore).to.equal(86400)
  })

  it('should require sufficient value for a renewal', async () => {
    expect(controller.renew(registrar.address, 'name', 86400)).to.be.revertedWith(
      'ETHController: Not enough Ether provided for renewal'
    )
  })

  it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
    await controller.connect(ownerAccount).withdraw(feeRecipient, 0)
    expect(parseInt(await getBalance(controller.address))).to.equal(0)
  })

  it('should set the reverse record of the account', async () => {
    const commitment = await controller.makeCommitment(
      'reverse',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      []
    )
    await controller.commit(commitment)

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    await controller.register(
      'reverse',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      registrar.address,
      { value: BUFFERED_REGISTRATION_COST }
    )

    await reverseRegistrar.setNameForAddr(
      ownerAccount.address,
      registrantAccount.address,
      resolver.address,
      'reverse.' + tld
    )
    expect(await resolver.name(getReverseNode(ownerAccount.address))).to.equal('reverse.' + tld)
  })

  it('should not set the reverse record of the account when set to false', async () => {
    const commitment = await controller.makeCommitment(
      'noreverse',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      []
    )
    await controller.commit(commitment)

    await increaseTime((await controller.minCommitmentAge()).toNumber())
    await controller.register(
      'noreverse',
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      registrar.address,
      { value: BUFFERED_REGISTRATION_COST }
    )

    expect(await resolver.name(getReverseNode(ownerAccount.address))).to.equal('')
  })

  it('approval should reduce gas for registration', async () => {
    const label = 'other'
    const name = label + '.' + tld
    const node = namehash.hash(name)
    const commitment = await controller.makeCommitment(
      label,
      registrantAccount.address,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [resolver.interface.encodeFunctionData('setAddr', [node, registrantAccount.address])]
    )

    await controller.commit(commitment)

    await increaseTime((await controller.minCommitmentAge()).toNumber())

    const gasA = await controller
      .connect(accounts[1])
      .estimateGas.register(
        label,
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [resolver.interface.encodeFunctionData('setAddr', [node, registrantAccount.address])],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )

    await resolver.connect(accounts[1]).setApprovalForAll(controller.address, true)

    const gasB = await controller
      .connect(accounts[1])
      .estimateGas.register(
        label,
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [resolver.interface.encodeFunctionData('setAddr', [node, registrantAccount.address])],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )

    const tx = await controller
      .connect(accounts[1])
      .register(
        label,
        registrantAccount.address,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [resolver.interface.encodeFunctionData('setAddr', [node, registrantAccount.address])],
        registrar.address,
        { value: BUFFERED_REGISTRATION_COST }
      )
    await tx.wait()

    // console.log((await tx.wait()).gasUsed.toString())
    //
    // console.log(gasA.toString(), gasB.toString())

    expect(await resolver.connect(accounts[1]).addr(node)).to.equal(registrantAccount.address)
  })
})
