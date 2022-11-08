import { PublicResolver, UniversalRegistry } from 'typechain-types'

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

import { assert, expect } from 'chai'
import { deploy, EMPTY_NODE } from '../helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
const { ethers } = require('hardhat')

describe('PublicResolver', () => {
  let node: string
  let ens: UniversalRegistry, resolver: PublicResolver
  const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'
  let accounts: SignerWithAddress[]

  beforeEach(async () => {
    node = namehash.hash('eth')
    ens = await deploy('UniversalRegistry')
    resolver = await deploy('PublicResolver', ens.address, EMPTY_ADDRESS)
    accounts = await ethers.getSigners()
    await resolver.addController(accounts[9].address)
    await ens.connect(accounts[0]).setSubnodeOwner(EMPTY_NODE, sha3('eth'), accounts[0].address)
  })

  describe('fallback function', async () => {
    it('forbids calls to the fallback function with 0 value', async () => {
      await expect(
        accounts[0].sendTransaction({
          to: resolver.address,
          gasLimit: 3000000,
        })
      ).to.be.reverted
    })

    it('forbids calls to the fallback function with 1 value', async () => {
      await expect(
        accounts[0].sendTransaction({
          to: resolver.address,
          gasLimit: 3000000,
          value: 1,
        })
      ).to.be.reverted
    })
  })

  describe('supportsInterface function', async () => {
    it('supports known interfaces', async () => {
      assert.equal(await resolver.supportsInterface('0x62b453ea'), true) // IAddrResolver
      assert.equal(await resolver.supportsInterface('0x691f3431'), true) // INameResolver
      assert.equal(await resolver.supportsInterface('0x2203ab56'), true) // IABIResolver
      assert.equal(await resolver.supportsInterface('0xc8690233'), true) // IPubkeyResolver
      assert.equal(await resolver.supportsInterface('0x59d1d43c'), true) // ITextResolver
      assert.equal(await resolver.supportsInterface('0xbc1c58d1'), true) // IContentHashResolver
      assert.equal(await resolver.supportsInterface('0x01ffc9a7'), true) // IInterfaceResolver
    })

    it('does not support a random interface', async () => {
      assert.equal(await resolver.supportsInterface('0x3b3b57df'), false)
    })
  })

  describe('addr', async () => {
    it('permits setting address by owner', async () => {
      await expect(resolver.setAddr(node, accounts[1].address))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[1].address.toLowerCase())
      assert.equal(await resolver.addr(node), accounts[1].address)
    })

    it('can overwrite previously set address', async () => {
      await resolver.setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)

      await resolver.setAddr(node, accounts[0].address)
      assert.equal(await resolver.addr(node), accounts[0].address)
    })

    it('can overwrite to same address', async () => {
      await resolver.setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)

      await resolver.setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)
    })

    it('forbids setting new address by non-owners', async () => {
      await expect(resolver.connect(accounts[1]).setAddr(node, accounts[1].address)).to.be.reverted
    })

    it('forbids writing same address by non-owners', async () => {
      await resolver.setAddr(node, accounts[1].address)

      await expect(resolver.connect(accounts[1]).setAddr(node, accounts[1].address)).to.be.reverted
    })

    it('forbids overwriting existing address by non-owners', async () => {
      await resolver.setAddr(node, accounts[1].address)

      await expect(resolver.connect(accounts[1]).setAddr(node, accounts[0].address)).to.be.reverted
    })

    it('returns zero when fetching nonexistent addresses', async () => {
      assert.equal(await resolver.addr(node), '0x0000000000000000000000000000000000000000')
    })

    it('permits setting and retrieving addresses for other coin types', async () => {
      await resolver.setAddrWithCoinType(node, 123, accounts[1].address)
      assert.equal(await resolver.addrWithCoinType(node, 123), accounts[1].address.toLowerCase())
    })

    it('returns ETH address for coin type 60', async () => {
      await expect(resolver.setAddr(node, accounts[1].address))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[1].address.toLowerCase())
      assert.equal(await resolver.addrWithCoinType(node, 60), accounts[1].address.toLowerCase())
    })

    it('setting coin type 60 updates ETH address', async () => {
      await expect(resolver.setAddrWithCoinType(node, 60, accounts[2].address))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[2].address.toLowerCase())
      assert.equal(await resolver.addr(node), accounts[2].address)
    })

    it('forbids calls to the fallback function with 1 value', async () => {
      await expect(
        accounts[0].sendTransaction({
          to: resolver.address,
          gasLimit: 3000000,
          value: 1,
        })
      ).to.be.reverted
    })
  })

  describe('addr', async () => {
    it('permits setting address by owner', async () => {
      await expect(resolver.setAddr(node, accounts[1].address))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[1].address.toLowerCase())
      assert.equal(await resolver.addr(node), accounts[1].address)
    })

    it('can overwrite previously set address', async () => {
      await resolver.setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)

      await resolver.setAddr(node, accounts[0].address)
      assert.equal(await resolver.addr(node), accounts[0].address)
    })

    it('can overwrite to same address', async () => {
      await resolver.setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)

      await resolver.setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)
    })

    it('forbids setting new address by non-owners', async () => {
      await expect(
        resolver.setAddr(node, accounts[1].address, {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('forbids writing same address by non-owners', async () => {
      await resolver.setAddr(node, accounts[1].address)

      await expect(
        resolver.setAddr(node, accounts[1].address, {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('forbids overwriting existing address by non-owners', async () => {
      await resolver.setAddr(node, accounts[1].address)

      await expect(
        resolver.setAddr(node, accounts[0].address, {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('returns zero when fetching nonexistent addresses', async () => {
      assert.equal(await resolver.addr(node), '0x0000000000000000000000000000000000000000')
    })

    it('permits setting and retrieving addresses for other coin types', async () => {
      await resolver.setAddrWithCoinType(node, 123, accounts[1].address)
      assert.equal(await resolver.addrWithCoinType(node, 123), accounts[1].address.toLowerCase())
    })

    it('returns ETH address for coin type 60', async () => {
      await expect(resolver.setAddr(node, accounts[1].address))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[1].address.toLowerCase())
      assert.equal(await resolver.addrWithCoinType(node, 60), accounts[1].address.toLowerCase())
    })

    it('setting coin type 60 updates ETH address', async () => {
      await expect(resolver.setAddrWithCoinType(node, 60, accounts[2].address))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[2].address.toLowerCase())
      assert.equal(await resolver.addr(node), accounts[2].address)
    })
  })

  describe('name', async () => {
    it('permits setting name by owner', async () => {
      await resolver.setName(node, 'name1')
      assert.equal(await resolver.name(node), 'name1')
    })

    it('can overwrite previously set names', async () => {
      await resolver.setName(node, 'name1')
      assert.equal(await resolver.name(node), 'name1')

      await resolver.setName(node, 'name2')
      assert.equal(await resolver.name(node), 'name2')
    })

    it('forbids setting name by non-owners', async () => {
      await expect(resolver.connect(accounts[1]).setName(node, 'name2')).to.be.reverted
    })

    it('returns empty when fetching nonexistent name', async () => {
      assert.equal(await resolver.name(node), '')
    })
  })

  describe('pubkey', async () => {
    it('returns empty when fetching nonexistent values', async () => {
      let result = await resolver.pubkey(node)
      assert.equal(result[0], '0x0000000000000000000000000000000000000000000000000000000000000000')
      assert.equal(result[1], '0x0000000000000000000000000000000000000000000000000000000000000000')
    })

    it('permits setting public key by owner', async () => {
      let x = '0x1000000000000000000000000000000000000000000000000000000000000000'
      let y = '0x2000000000000000000000000000000000000000000000000000000000000000'

      await resolver.setPubkey(node, x, y)

      let result = await resolver.pubkey(node)
      assert.equal(result[0], x)
      assert.equal(result[1], y)
    })

    it('can overwrite previously set value', async () => {
      await resolver
        .connect(accounts[0])
        .setPubkey(
          node,
          '0x1000000000000000000000000000000000000000000000000000000000000000',
          '0x2000000000000000000000000000000000000000000000000000000000000000'
        )

      let x = '0x3000000000000000000000000000000000000000000000000000000000000000'
      let y = '0x4000000000000000000000000000000000000000000000000000000000000000'
      await resolver.setPubkey(node, x, y)

      let result = await resolver.pubkey(node)
      assert.equal(result[0], x)
      assert.equal(result[1], y)
    })

    it('can overwrite to same value', async () => {
      let x = '0x1000000000000000000000000000000000000000000000000000000000000000'
      let y = '0x2000000000000000000000000000000000000000000000000000000000000000'

      await resolver.setPubkey(node, x, y)
      await resolver.setPubkey(node, x, y)

      let result = await resolver.pubkey(node)
      assert.equal(result[0], x)
      assert.equal(result[1], y)
    })

    it('forbids setting value by non-owners', async () => {
      await expect(
        resolver
          .connect(accounts[1])
          .setPubkey(
            node,
            '0x1000000000000000000000000000000000000000000000000000000000000000',
            '0x2000000000000000000000000000000000000000000000000000000000000000'
          )
      ).to.be.reverted
    })

    it('forbids writing same value by non-owners', async () => {
      let x = '0x1000000000000000000000000000000000000000000000000000000000000000'
      let y = '0x2000000000000000000000000000000000000000000000000000000000000000'

      await resolver.setPubkey(node, x, y)

      await expect(resolver.connect(accounts[1]).setPubkey(node, x, y)).to.be.reverted
    })

    it('forbids overwriting existing value by non-owners', async () => {
      await resolver
        .connect(accounts[0])
        .setPubkey(
          node,
          '0x1000000000000000000000000000000000000000000000000000000000000000',
          '0x2000000000000000000000000000000000000000000000000000000000000000'
        )

      await expect(
        resolver
          .connect(accounts[1])
          .setPubkey(
            node,
            '0x3000000000000000000000000000000000000000000000000000000000000000',
            '0x4000000000000000000000000000000000000000000000000000000000000000'
          )
      ).to.be.reverted
    })
  })

  describe('ABI', async () => {
    it('returns a contentType of 0 when nothing is available', async () => {
      expect((await resolver.ABI(node, 0xffffffff))[0]).to.be.deep.equal(BigNumber.from(0))
    })

    it('returns an ABI after it has been set', async () => {
      await resolver.setABI(node, 0x1, '0x666f6f')
      let result = await resolver.ABI(node, 0xffffffff)
      assert.deepEqual([result[0].toNumber(), result[1]], [1, '0x666f6f'])
    })

    it('returns the first valid ABI', async () => {
      await resolver.setABI(node, 0x2, '0x666f6f')
      await resolver.setABI(node, 0x4, '0x626172')

      let result = await resolver.ABI(node, 0x7)
      assert.deepEqual([result[0].toNumber(), result[1]], [2, '0x666f6f'])

      result = await resolver.ABI(node, 0x5)
      assert.deepEqual([result[0].toNumber(), result[1]], [4, '0x626172'])
    })

    it('allows deleting ABIs', async () => {
      await resolver.setABI(node, 0x1, '0x666f6f')
      let result = await resolver.ABI(node, 0xffffffff)
      assert.deepEqual([result[0].toNumber(), result[1]], [1, '0x666f6f'])

      await resolver.setABI(node, 0x1, '0x')
      result = await resolver.ABI(node, 0xffffffff)
      assert.deepEqual([result[0].toNumber(), result[1]], [0, '0x'])
    })

    it('rejects invalid content types', async () => {
      await expect(resolver.setABI(node, 0x3, '0x12')).to.be.reverted
    })

    it('forbids setting value by non-owners', async () => {
      await expect(resolver.connect(accounts[1]).setABI(node, 0x1, '0x666f6f')).to.be.reverted
    })
  })

  describe('text', async () => {
    var url = 'https://ethereum.org'
    var url2 = 'https://github.com/ethereum'

    it('permits setting text by owner', async () => {
      await resolver.setText(node, 'url', url)
      assert.equal(await resolver.text(node, 'url'), url)
    })

    it('can overwrite previously set text', async () => {
      await resolver.setText(node, 'url', url)
      assert.equal(await resolver.text(node, 'url'), url)

      await resolver.setText(node, 'url', url2)
      assert.equal(await resolver.text(node, 'url'), url2)
    })

    it('can overwrite to same text', async () => {
      await resolver.setText(node, 'url', url)
      assert.equal(await resolver.text(node, 'url'), url)

      await resolver.setText(node, 'url', url)
      assert.equal(await resolver.text(node, 'url'), url)
    })

    it('forbids setting new text by non-owners', async () => {
      await expect(resolver.connect(accounts[1]).setText(node, 'url', url)).to.be.reverted
    })

    it('forbids writing same text by non-owners', async () => {
      await resolver.setText(node, 'url', url)

      await expect(resolver.connect(accounts[1]).setText(node, 'url', url)).to.be.reverted
    })
  })

  describe('contenthash', async () => {
    it('permits setting contenthash by owner', async () => {
      await resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000001')
      assert.equal(
        await resolver.contenthash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      )
    })

    it('can overwrite previously set contenthash', async () => {
      await resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000001')
      assert.equal(
        await resolver.contenthash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      )

      await resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000002')
      assert.equal(
        await resolver.contenthash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000002'
      )
    })

    it('can overwrite to same contenthash', async () => {
      await resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000001')
      assert.equal(
        await resolver.contenthash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      )

      await resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000002')
      assert.equal(
        await resolver.contenthash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000002'
      )
    })

    it('forbids setting contenthash by non-owners', async () => {
      await expect(
        resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000001', {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('forbids writing same contenthash by non-owners', async () => {
      await resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000001')

      await expect(
        resolver.setContenthash(node, '0x0000000000000000000000000000000000000000000000000000000000000001', {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('returns empty when fetching nonexistent contenthash', async () => {
      assert.equal(await resolver.contenthash(node), '0x')
    })
  })

  describe('implementsInterface', async () => {
    it('permits setting interface by owner', async () => {
      await resolver.setInterface(node, '0x12345678', accounts[0].address)
      assert.equal(await resolver.interfaceImplementer(node, '0x12345678'), accounts[0].address)
    })

    it('can update previously set interface', async () => {
      await resolver.setInterface(node, '0x12345678', resolver.address)
      assert.equal(await resolver.interfaceImplementer(node, '0x12345678'), resolver.address)
    })

    it('forbids setting interface by non-owner', async () => {
      await expect(
        resolver.setInterface(node, '0x12345678', accounts[1].address, {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('returns 0 when fetching unset interface', async () => {
      assert.equal(
        await resolver.interfaceImplementer(namehash.hash('foo'), '0x12345678'),
        '0x0000000000000000000000000000000000000000'
      )
    })

    it('falls back to calling implementsInterface on addr', async () => {
      // Set addr to the resolver itself, since it has interface implementations.
      await resolver.setAddrWithCoinType(node, 60, resolver.address)
      // Check the ID for `addr(bytes32)`
      assert.equal(await resolver.interfaceImplementer(node, '0x62b453ea'), resolver.address)
    })

    it('returns 0 on fallback when target contract does not implement interface', async () => {
      // Check an imaginary interface ID we know it doesn't support.
      assert.equal(
        await resolver.interfaceImplementer(node, '0x00000000'),
        '0x0000000000000000000000000000000000000000'
      )
    })

    it('returns 0 on fallback when target contract does not support implementsInterface', async () => {
      // Set addr to the UniversalRegistry registry, which doesn't implement supportsInterface.
      await resolver.setAddr(node, ens.address)
      // Check the ID for `supportsInterface(bytes4)`
      assert.equal(
        await resolver.interfaceImplementer(node, '0x01ffc9a7'),
        '0x0000000000000000000000000000000000000000'
      )
    })

    it('returns 0 on fallback when target is not a contract', async () => {
      // Set addr to an externally owned account.
      await resolver.setAddr(node, accounts[0].address)
      // Check the ID for `supportsInterface(bytes4)`
      assert.equal(
        await resolver.interfaceImplementer(node, '0x01ffc9a7'),
        '0x0000000000000000000000000000000000000000'
      )
    })
  })

  describe('authorisations', async () => {
    it('permits authorisations to be set', async () => {
      await resolver.setApprovalForAll(accounts[1].address, true)
      assert.equal(await resolver.isApprovedForAll(accounts[0].address, accounts[1].address), true)
    })

    it('permits authorised users to make changes', async () => {
      await resolver.setApprovalForAll(accounts[1].address, true)
      assert.equal(await resolver.isApprovedForAll(await ens.owner(node), accounts[1].address), true)
      await resolver.connect(accounts[1]).setAddr(node, accounts[1].address)
      assert.equal(await resolver.addr(node), accounts[1].address)
    })

    it('permits authorisations to be cleared', async () => {
      await resolver.setApprovalForAll(accounts[1].address, false)
      await expect(
        resolver.setAddr(node, accounts[0].address, {
          from: accounts[1].address,
        })
      ).to.be.reverted
    })

    it('permits non-owners to set authorisations', async () => {
      await resolver.connect(accounts[1]).setApprovalForAll(accounts[2].address, true)

      // The authorisation should have no effect, because accounts[1] is not the owner.
      await expect(resolver.connect(accounts[2]).setAddr(node, accounts[0].address)).to.be.reverted
    })

    it('checks the authorisation for the current owner', async () => {
      await resolver.connect(accounts[1]).setApprovalForAll(accounts[2].address, true)
      await ens.setOwner(node, accounts[1].address)

      await resolver.connect(accounts[2]).setAddr(node, accounts[0].address)
      assert.equal(await resolver.addr(node), accounts[0].address)
    })

    it('trusted contract can bypass authorisation', async () => {
      await resolver.connect(accounts[9]).setAddr(node, accounts[9].address)
      assert.equal(await resolver.addr(node), accounts[9].address)
    })

    it('emits an ApprovalForAll log', async () => {
      const owner = accounts[0]
      const operator = accounts[1]
      await expect(resolver.connect(owner).setApprovalForAll(operator.address, true))
        .to.emit(resolver, 'ApprovalForAll')
        .withArgs(owner.address, operator.address, true)
    })

    it('reverts if attempting to approve self as an operator', async () => {
      await expect(resolver.connect(accounts[1]).setApprovalForAll(accounts[1].address, true)).to.be.revertedWith(
        'PublicResolver: setting approval status for self'
      )
    })

    it('permits name wrapper owner to make changes if owner is set to name wrapper address', async () => {
      const owner = await ens.owner(node)
      const operator = accounts[2]
      await expect(resolver.connect(operator).setAddr(node, owner)).to.be.reverted
      await expect(resolver.connect(operator).setAddr(node, owner))
    })
  })

  describe('multicall', async () => {
    it('allows setting multiple fields', async () => {
      const setAddrTxData = (await resolver.populateTransaction.setAddr(node, accounts[1].address)).data as string
      const setTextData = (await resolver.populateTransaction.setText(node, 'url', 'https://ethereum.org/'))
        .data as string
      await expect(resolver.multicall([setAddrTxData, setTextData]))
        .to.emit(resolver, 'AddressChanged')
        .withArgs(node, 60, accounts[1].address)
        .emit(resolver, 'TextChanged')
        .withArgs(node, 'url', 'https://ethereum.org/')

      assert.equal(await resolver.addr(node), accounts[1].address)
      assert.equal(await resolver.text(node, 'url'), 'https://ethereum.org/')
    })

    it('allows reading multiple fields', async () => {
      await resolver.setAddr(node, accounts[1].address)
      await resolver.setText(node, 'url', 'https://ethereum.org/')
      const results = await resolver.callStatic.multicall([
        (await resolver.populateTransaction.addr(node)).data as string,
        (await resolver.populateTransaction.text(node, 'url')).data as string,
      ])
      assert.equal(resolver.interface.decodeFunctionResult('addr', results[0])[0], accounts[1].address)
      assert.equal(resolver.interface.decodeFunctionResult('text', results[1])[0], 'https://ethereum.org/')
    })
  })

  describe('multicall2', async () => {
    it('allows setting multiple fields', async () => {
      await resolver.multicall2(node, accounts[0].address, ['url'], ['https://ethereum.org/'])
      assert.equal(await resolver.addr(node), accounts[0].address)
      assert.equal(await resolver.text(node, 'url'), 'https://ethereum.org/')
    })
  })
})
