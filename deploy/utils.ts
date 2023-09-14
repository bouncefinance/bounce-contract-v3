import { ethers } from 'hardhat'
import { DeploymentsExtension } from 'hardhat-deploy/types'

export async function deployProxy(
    deployments: DeploymentsExtension,
    deployer: string,
    contractName: string,
    initValues: any[]
) {
    const { deploy } = deployments
    const proxyAdmin = await deployments.getOrNull('DefaultProxyAdmin')
    if (proxyAdmin === undefined) {
        console.log('DefaultProxyAdmin not deployed')
        return
    }

    const { address: implAddr, abi: implABI } = await deploy(`${contractName}_Implementation`, {
        from: deployer,
        contract: contractName,
    })
    console.log(`${contractName} implementation deployed at`, implAddr)

    const proxy = await deployments.getOrNull(`${contractName}_Proxy`)
    if (proxy === undefined) {
        const data = new ethers.utils.Interface(implABI).encodeFunctionData('initialize', initValues)
        const { address: proxyAddr } = await deploy(`${contractName}_Proxy`, {
            from: deployer,
            contract: 'TransparentUpgradeableProxy',
            args: [implAddr, proxyAdmin?.address as string, data],
            skipIfAlreadyDeployed: true,
        })
        console.log(`${contractName} proxy deployed at`, proxyAddr)
    } else {
        const proxyAdminContract = await ethers.getContractAt('ProxyAdmin', proxyAdmin?.address as string)
        if ((await proxyAdminContract.getProxyImplementation(proxy?.address)) !== implAddr) {
            const tx = await proxyAdminContract.upgrade(proxy?.address, implAddr)
            await tx.wait()
        }
        console.log(`${contractName} reusing proxy`, proxy?.address)
    }
}
