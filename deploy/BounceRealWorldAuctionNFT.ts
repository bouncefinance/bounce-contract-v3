import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'hardhat'
import { CHAINID } from '../constants/constants'
import { deployProxy } from './utils'

const deployFunction: DeployFunction = async function ({
    deployments,
    ethers,
    getNamedAccounts,
    network,
}: HardhatRuntimeEnvironment) {
    console.log('Running BounceRealWorldAuctionNFT deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    // const name = 'Diamond Hand Necklace'
    // const symbol = 'DiamondHandNecklace'
    // const baseURI = 'https://arweave.net/67AnteVXgRDhDL6kbUAyY2bCQT7skF-e4UK8P935NnI/'
    // const deployName = 'BounceRealWorldAuctionNFT'

    const name = 'Bounce Real World Auction'
    const symbol = 'BounceRWA'
    const baseURI = 'https://arweave.net/v-TIp2WTzqUJ4xia1t3slJe1wLhBShKvPwKE7ZazXa4/'
    const deployName = 'BounceRealWorldAuctionNFT-BounceRWA'

    // const name = 'iPhone15 Mutant English Auction'
    // const symbol = 'BMEA'
    // const baseURI = 'https://arweave.net/d_EUDNcW7yTBfSA21ya8Fe10PUcmsJMkyK7aflz7MUo/'
    // const deployName = 'BounceRealWorldAuctionNFT-BMEA'

    const chainId = network.config.chainId as CHAINID

    if (chainId === CHAINID.ZKSYNC || chainId === CHAINID.ZKSYNC_TEST) {
        await deployProxy(deployments, deployer, 'BounceRealWorldAuctionNFT', [name, symbol, baseURI])
        return
    }

    const { address } = await deploy(deployName, {
        from: deployer,
        log: true,
        deterministicDeployment: false,
        contract: 'BounceRealWorldAuctionNFT',
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [name, symbol, baseURI],
                },
            },
        },
    })
    console.log('BounceRealWorldAuctionNFT deployed at', address)
}

export default deployFunction

deployFunction.dependencies = ['']

deployFunction.tags = ['BounceRealWorldAuctionNFT']
