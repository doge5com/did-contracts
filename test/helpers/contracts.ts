import { FactoryOptions } from '@nomiclabs/hardhat-ethers/types'

import { Signer } from 'ethers'
import { DeployProxyOptions } from '@openzeppelin/hardhat-upgrades/src/utils'
const { ethers, network, upgrades } = require('hardhat')

export const deployWithSpecialCreator = async (
  contractName: string,
  signerOrOptions?: Signer | FactoryOptions,
  ...args: Array<any>
) => {
  const factory = await ethers.getContractFactory(contractName, signerOrOptions)
  return factory.deploy(...args)
}

export const deploy = async (contractName: string, ...args: Array<any>) => {
  return deployWithSpecialCreator(contractName, undefined, ...args)
}

export const deployProxy = async (contractName: string, args?: unknown[], opts?: DeployProxyOptions) => {
  const factory = await ethers.getContractFactory(contractName)
  return upgrades.deployProxy(factory, args, opts)
}
