const { ethers, network, upgrades } = require('hardhat')

export const getBalance = async (addressOrName: string | Promise<string>) => {
  return ethers.provider.getBalance(addressOrName)
}
