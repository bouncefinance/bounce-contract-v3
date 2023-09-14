import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers } from 'hardhat'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
    console.log('Running BounceStake deploy script')
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    // const stakingToken = ethers.constants.AddressZero
    const stakingToken = '0x0F8086D08A69eBD8e3a130A87A3b6A260723976f'
    const rewardsDuration = Math.floor(new Date().getTime() / 1000) + 3600
    const maxPerWaller = ethers.utils.parseEther('100000')

    const { address } = await deploy('BounceStake', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [stakingToken, rewardsDuration, maxPerWaller],
                },
            },
        },
    })

    console.log('BounceStake deployed at', address)
}

export default deployFunction

deployFunction.dependencies = []

deployFunction.tags = ['BounceStake']
