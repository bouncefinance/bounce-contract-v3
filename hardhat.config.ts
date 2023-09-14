import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@matterlabs/hardhat-zksync-solc'
import '@matterlabs/hardhat-zksync-verify'
import '@nomiclabs/hardhat-etherscan'
import 'hardhat-contract-sizer'
import 'hardhat-deploy'
import 'dotenv/config'
import './tasks'

const accounts = [
    (process.env.MNEMONIC as string) || '0000000000000000000000000000000000000000000000000000000000000000',
]

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_API_KEY,
            sepolia: process.env.ETHERSCAN_API_KEY,
            goerli: process.env.ETHERSCAN_API_KEY,
            arbitrumOne: process.env.ARBISCAN_API_KEY,
            bsc: process.env.BSCSCAN_API_KEY,
            optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY,
            'polygon-zkevm': process.env.POLYGONSCAN_ZKEVM_API_KEY,
            'scroll-alpha': process.env.SCROLL_API_KEY,
        },
        customChains: [
            {
                network: 'polygon-zkevm',
                chainId: 1101,
                urls: {
                    apiURL: 'https://api-zkevm.polygonscan.com/api',
                    browserURL: 'https://zkevm.polygonscan.com/',
                },
            },
            {
                network: 'scroll-alpha',
                chainId: 534353,
                urls: {
                    apiURL: 'https://blockscout.scroll.io/api',
                    browserURL: 'https://blockscout.scroll.io/',
                },
            },
        ],
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    networks: {
        hardhat: {
            chainId: 1337,
            forking: {
                enabled: process.env.FORKING === 'true',
                url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            },
        },
        mainnet: {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 1,
        },
        goerli: {
            url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 5,
        },
        optimism: {
            url: `https://mainnet.optimism.io`,
            accounts,
            chainId: 10,
        },
        cronos: {
            url: `https://evm.cronos.org/`,
            accounts,
            chainId: 25,
        },
        bsc: {
            url: `https://bsc-dataseed.binance.org/`,
            accounts,
            chainId: 56,
        },
        okexchain: {
            url: `https://exchainrpc.okex.org/`,
            accounts,
            chainId: 66,
        },
        'bsc-mainnet-testing': {
            url: `https://bsc-dataseed.binance.org/`,
            accounts,
            chainId: 56,
        },
        'gnosis-chain': {
            url: `https://rpc.gnosischain.com/`,
            accounts,
            chainId: 100,
        },
        polygon: {
            url: `https://polygon-rpc.com`,
            accounts,
            chainId: 137,
        },
        'omni-testnet': {
            url: `https://testnet-1.omni.network/`,
            accounts,
            chainId: 165,
        },
        fantom: {
            url: `https://rpc.ftm.tools/`,
            accounts,
            chainId: 250,
        },
        'zksync-era-testnet': {
            zksync: true,
            url: `https://testnet.era.zksync.dev/`,
            accounts,
            chainId: 280,
        },
        'zksync-era': {
            zksync: true,
            url: `https://mainnet.era.zksync.io`,
            accounts,
            chainId: 324,
            verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification',
        },
        rollux: {
            url: `https://rpc.rollux.com`,
            accounts,
            chainId: 570,
        },
        'polygon-zkevm': {
            url: `https://zkevm-rpc.com/`,
            accounts,
            chainId: 1101,
        },
        moonbeam: {
            url: `https://rpc.api.moonbeam.network/`,
            accounts,
            chainId: 1284,
        },
        moonriver: {
            url: `https://rpc.api.moonriver.moonbeam.network/`,
            accounts,
            chainId: 1285,
        },
        'polygon-zkevm-testnet': {
            url: `https://rpc.public.zkevm-test.net/`,
            accounts,
            chainId: 1442,
        },
        dogechain: {
            url: `https://rpc.dogechain.dog/`,
            accounts,
            chainId: 2000,
        },
        kava: {
            url: `https://evm2.kava.io/`,
            accounts,
            chainId: 2222,
        },
        'fantom-testnet': {
            url: `https://rpc.testnet.fantom.network/`,
            accounts,
            chainId: 4002,
        },
        'zetaChain-athens-testnet': {
            url: `https://zetachain-athens-evm.blockpi.network/v1/rpc/public/`,
            accounts,
            chainId: 7001,
        },
        klaytn: {
            url: `https://public-node-api.klaytnapi.com/v1/cypress/`,
            accounts,
            chainId: 8217,
        },
        base: {
            url: `https://mainnet.base.org`,
            accounts,
            chainId: 8453,
        },
        evmos: {
            url: `https://eth.bd.evmos.org:8545/`,
            accounts,
            chainId: 9001,
        },
        fusion: {
            url: `https://mainnet.anyswap.exchange/`,
            accounts,
            chainId: 32659,
        },
        'arbitrum-one': {
            url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts,
            chainId: 42161,
        },
        avalanche: {
            url: `https://avalanche-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 43114,
        },
        celo: {
            url: `https://celo-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 42220,
        },
        'linea-goerli': {
            url: `https://linea-goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 59140,
        },
        linea: {
            url: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 59144,
        },
        'base-goerli': {
            url: `https://goerli.base.org`,
            accounts,
            chainId: 84531,
        },
        'scroll-alpha': {
            url: `https://alpha-rpc.scroll.io/l2`,
            accounts,
            chainId: 534353,
        },
        sepolia: {
            url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 11155111,
        },
        aurora: {
            url: `https://aurora-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 1313161554,
        },
        harmony: {
            url: `https://api.harmony.one/`,
            accounts,
            chainId: 1666600000,
        },
        palm: {
            url: `https://palm-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts,
            chainId: 11297108109,
        },
    },
    solidity: {
        compilers: [
            {
                version: '0.8.17',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.4.16',
            },
            {
                version: '0.4.25',
                settings: {
                    optimizer: {
                        enabled: false,
                        runs: 200,
                    },
                },
            },
        ],
    },
    zksolc: {
        version: '1.3.8',
    },
    contractSizer: {
        alphaSort: true,
        disambiguatePaths: false,
        runOnCompile: true,
        strict: false,
    },
}

export default config
