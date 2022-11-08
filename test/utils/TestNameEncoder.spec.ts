import { TestNameEncoder, TestNameEncoder__factory } from 'typechain-types'
const { expect } = require('chai')
import { hexEncodeName } from '../helpers'
const { ethers, network, upgrades } = require('hardhat')
const { namehash, solidityKeccak256 } = require('ethers/lib/utils')

describe('TestNameEncoder', () => {
  let testNameEncoder: TestNameEncoder
  beforeEach(async () => {
    const TestNameEncoder: TestNameEncoder__factory = await ethers.getContractFactory('TestNameEncoder')
    testNameEncoder = await TestNameEncoder.deploy()
  })

  describe('encodeName()', () => {
    it('should encode a name', async () => {
      const result = await testNameEncoder.encodeName('foo.eth')
      expect(result['0']).to.equal(hexEncodeName('foo.eth'))
      expect(result['1']).to.equal(namehash('foo.eth'))
    })

    it('should encode an empty name', async () => {
      const result = await testNameEncoder.encodeName('')
      expect(result['0']).to.equal(hexEncodeName(''))
      expect(result['1']).to.equal(namehash(''))
    })

    it('should encode a long name', async () => {
      const result = await testNameEncoder.encodeName('something.else.test.eth')
      expect(result['0']).to.equal(hexEncodeName('something.else.test.eth'))
      expect(result['1']).to.equal(namehash('something.else.test.eth'))
    })
  })
})
