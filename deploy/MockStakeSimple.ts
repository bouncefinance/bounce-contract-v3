import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'hardhat'
import { CHAINID } from '../constants/constants'
import { deployProxy } from './utils'

const deployFunction: DeployFunction = async function ({
    deployments,
    getNamedAccounts,
    network,
}: HardhatRuntimeEnvironment) {
    console.log('Running MockStakeSimple deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const auctionToken = ethers.constants.AddressZero
    const chainId = network.config.chainId as CHAINID

    if (chainId === CHAINID.ZKSYNC || chainId === CHAINID.ZKSYNC_TEST) {
        await deployProxy(deployments, deployer, 'MockStakeSimple', [auctionToken])
        return
    }

    const { address } = await deploy('MockStakeSimple', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [auctionToken],
                },
            },
        },
    })
    console.log('MockStakeSimple deployed at', address)
}

export default deployFunction

deployFunction.dependencies = ['']

deployFunction.tags = ['MockStakeSimple']
