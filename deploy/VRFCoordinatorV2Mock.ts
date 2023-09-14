import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { CHAINID } from '../constants/constants'

const deployFunction: DeployFunction = async function ({
    deployments,
    getNamedAccounts,
    network,
}: HardhatRuntimeEnvironment) {
    const chainId = network.config.chainId as CHAINID
    if (chainId !== CHAINID.HARDHAT) {
        return
    }
    console.log('Running VRFCoordinatorV2Mock deploy script')

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    const { address } = await deploy('VRFCoordinatorV2Mock', {
        from: deployer,
        args: [0, 0],
    })
    console.log('VRFCoordinatorV2Mock deployed at', address)
}

export default deployFunction

deployFunction.dependencies = ['']

deployFunction.tags = ['VRFCoordinatorV2Mock']
