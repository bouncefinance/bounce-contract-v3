import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
    console.log('Running Multicall3 deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const { address } = await deploy('Multicall3', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
    })

    console.log('Multicall3 deployed at', address)
}

export default deployFunction

deployFunction.dependencies = []

deployFunction.tags = ['Multicall3']
