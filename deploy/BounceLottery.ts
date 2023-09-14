import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'hardhat'
import {
    CHAINID,
    COORDINATOR_ADDRESS,
    KEYHASH_ADDRESS,
    LINK_ADDRESS,
    SIGNER_ADDRESS,
    STAKING_ADDRESS,
} from '../constants/constants'
import { deployProxy } from './utils'

const deployFunction: DeployFunction = async function ({
    deployments,
    getNamedAccounts,
    network,
}: HardhatRuntimeEnvironment) {
    console.log('Running BounceLottery deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const chainId = network.config.chainId as CHAINID
    const vrfCoordinator = COORDINATOR_ADDRESS[chainId] || (await deployments.get('VRFCoordinatorV2Mock')).address
    const linkTokenContract = LINK_ADDRESS[chainId]
    const keyHash = KEYHASH_ADDRESS[chainId]
    const txFeeRatio = ethers.utils.parseEther('0.025')
    const stakeContract = STAKING_ADDRESS[chainId]
    const signer = SIGNER_ADDRESS[chainId]

    if (chainId === CHAINID.ZKSYNC || chainId === CHAINID.ZKSYNC_TEST) {
        await deployProxy(deployments, deployer, 'BounceLottery', [
            txFeeRatio,
            stakeContract,
            signer,
            vrfCoordinator,
            linkTokenContract,
            keyHash,
        ])
        return
    }

    const { address } = await deploy('BounceLottery', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [txFeeRatio, stakeContract, signer, vrfCoordinator, linkTokenContract, keyHash],
                },
            },
        },
    })

    console.log('BounceLottery deployed at', address)
}

export default deployFunction

deployFunction.dependencies = ['VRFCoordinatorV2Mock']

deployFunction.tags = ['BounceLottery']
