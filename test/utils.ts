import { ethers } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

export function ether(n: string) {
    return ethers.utils.parseEther(n)
}

export function usd(n: string) {
    return ether(n).div(BigNumber.from('10').pow(BigNumber.from('12')))
}

export async function sign(
    signer: Signer,
    types: string[],
    values: any[],
    sender: SignerWithAddress,
    expireAt: BigNumber
) {
    const abiCoder = ethers.utils.defaultAbiCoder
    const chainId = 1337
    const message = abiCoder.encode(
        ['address', 'bytes32', 'uint256', 'uint256'],
        [sender.address, ethers.utils.keccak256(abiCoder.encode(types, values)), chainId, expireAt]
    )
    const hashMessage = ethers.utils.keccak256(message)
    return await signer.signMessage(ethers.utils.arrayify(hashMessage))
}

export enum PoolType {
    FixedSwap,
    DutchAuction,
    SealedBid,
    Random,
    FixedSwapNFT,
    EnglishAuctionNFT,
    RandomNFT,
    EnglishAuction,
    MutantEnglishAuctionNFT,
}

export enum ReleaseType {
    Instant,
    Cliff,
    Linear,
    Fragment,
}

export const types = ['uint256', 'uint256']
