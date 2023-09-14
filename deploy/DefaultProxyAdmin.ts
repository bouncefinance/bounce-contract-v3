import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { CHAINID } from '../constants/constants'

const deployFunction: DeployFunction = async function ({
    deployments,
    getNamedAccounts,
    network,
}: HardhatRuntimeEnvironment) {
    const chainId = network.config.chainId as CHAINID
    if (chainId === CHAINID.ZKSYNC || chainId === CHAINID.HARDHAT) {
        console.log('Running ProxyAdmin deploy script')

        const { deploy } = deployments
        const { deployer } = await getNamedAccounts()

        const { address } = await deploy('DefaultProxyAdmin', {
            from: deployer,
            log: true,
            deterministicDeployment: false,
            contract: 'ProxyAdmin',
        })

        console.log('ProxyAdmin deployed at', address)
    }
}

export default deployFunction

deployFunction.dependencies = ['']

deployFunction.tags = ['DefaultProxyAdmin']
