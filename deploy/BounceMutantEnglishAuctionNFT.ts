import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'hardhat'
import { CHAINID, STAKING_ADDRESS, SIGNER_ADDRESS } from '../constants/constants'
import { deployProxy } from './utils'

const deployFunction: DeployFunction = async function ({
    deployments,
    getNamedAccounts,
    network,
}: HardhatRuntimeEnvironment) {
    console.log('Running BounceMutantEnglishAuctionNFT deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const chainId = network.config.chainId as CHAINID
    const txFeeRatio = ethers.utils.parseEther('0.006') // 0.6%
    const stakeContract = STAKING_ADDRESS[chainId]
    const signer = SIGNER_ADDRESS[chainId]

    if (chainId === CHAINID.ZKSYNC || chainId === CHAINID.ZKSYNC_TEST) {
        await deployProxy(deployments, deployer, 'BounceMutantEnglishAuctionNFT', [txFeeRatio, stakeContract, signer])
        return
    }

    const { address } = await deploy('BounceMutantEnglishAuctionNFT', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [txFeeRatio, stakeContract, signer],
                },
            },
        },
    })

    console.log('BounceMutantEnglishAuctionNFT deployed at', address)
}

export default deployFunction

deployFunction.dependencies = []

deployFunction.tags = ['BounceMutantEnglishAuctionNFT']
