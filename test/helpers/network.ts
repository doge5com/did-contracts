const { ethers, network, upgrades } = require('hardhat')

export const getChainId = (): number => {
  return network.config.chainId
}
