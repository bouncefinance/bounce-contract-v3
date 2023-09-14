import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
    console.log('Running MockAuction deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const { address } = await deploy('MockAuction', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
    })

    console.log('MockAuction deployed at', address)
}

export default deployFunction

deployFunction.dependencies = []

deployFunction.tags = ['MockAuction']
