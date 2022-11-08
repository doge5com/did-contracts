import 'dotenv/config'

import { HardhatUserConfig, task, subtask } from 'hardhat/config'
import { getNetwork } from '@ethersproject/networks'
import { TASK_TEST_GET_TEST_FILES } from 'hardhat/builtin-tasks/task-names'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-solhint'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import 'hardhat-contract-sizer'
import 'hardhat-deploy'
import 'hardhat-docgen'
import 'hardhat-gas-reporter'
import 'hardhat-watcher'
import 'hardhat-tracer'
import 'solidity-coverage'
import '@openzeppelin/hardhat-upgrades'
import 'tsconfig-paths/register'

task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners()
  for (const account of accounts) {
    console.log(account.address)
  }
})

subtask(TASK_TEST_GET_TEST_FILES).setAction(async (_, __, runSuper) => {
  const paths = await runSuper()
  // @ts-ignore
  return paths.filter((file) => (file as string).endsWith('.spec.ts'))
})

const PRIVATE_KEYS = [
  process.env.PRIVATE_KEY || '0x1111111111111111111111111111111111111111111111111111111111111111',
  process.env.PRIVATE_KEY_1,
  process.env.PRIVATE_KEY_2,
  process.env.PRIVATE_KEY_3,
  process.env.PRIVATE_KEY_4,
].filter((key) => !!key) as Array<string>
const INFURA_API_KEY = process.env.INFURA_API_KEY || '00'

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
      hardfork: 'berlin', // Berlin is used (temporarily) to avoid issues with coverage
      mining: {
        auto: true,
        interval: 50000,
      },
      gasPrice: 'auto',
    },
    mainnet: {
      url: process.env.MAINNET_PROVIDER_URL || `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      chainId: getNetwork('mainnet').chainId,
      accounts: PRIVATE_KEYS,
    },
    ropsten: {
      url: process.env.ROPSTEN_PROVIDER_URL || `https://ropsten.infura.io/v3/${INFURA_API_KEY}`,
      chainId: getNetwork('ropsten').chainId,
      accounts: PRIVATE_KEYS,
    },
    goerli: {
      url: process.env.GOERLI_PROVIDER_URL || `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
      chainId: getNetwork('goerli').chainId,
      accounts: PRIVATE_KEYS,
    },
    sepolia: {
      url: process.env.SEPOLIA_PROVIDER_URL || `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      chainId: getNetwork('sepolia').chainId,
      accounts: PRIVATE_KEYS,
    },
    bnbmain: {
      url: process.env.BNBMAIN_PROVIDER_URL || 'https://rpc.ankr.com/bsc',
      chainId: getNetwork('bnb').chainId,
      accounts: PRIVATE_KEYS,
    },
    bnbtest: {
      url: process.env.BNBTEST_PROVIDER_URL || 'https://data-seed-prebsc-1-s3.binance.org:8545/',
      chainId: getNetwork('bnbt').chainId,
      accounts: PRIVATE_KEYS,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    compilers: [
      {
        version: '0.8.13',
        settings: { optimizer: { enabled: true, runs: 10000 } },
      },
    ],
  },
  paths: {
    sources: './contracts/',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v5',
  },
}

export default config
