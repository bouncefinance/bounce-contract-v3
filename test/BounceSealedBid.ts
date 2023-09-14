import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract, Signer } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import TetherToken from './abis/TetherToken.json'
import BounceStakeSimple from './abis/BounceStakeSimple.json'
import ERC20PresetMinterPauser from '../node_modules/@openzeppelin/contracts/build/contracts/ERC20PresetMinterPauser.json'
import { MerkleTree } from 'merkletreejs'
import { ether, PoolType, ReleaseType, sign, types, usd } from './utils'

async function bidSignature(
    signer: Signer,
    index: number,
    sender: SignerWithAddress,
    amount0: BigNumber,
    amount1: BigNumber
): Promise<{ priceHash: string; signature: string }> {
    const abiCoder = ethers.utils.defaultAbiCoder
    const priceHash = ethers.utils.keccak256(
        abiCoder.encode(['uint256', 'address', 'uint256', 'uint256'], [index, sender.address, amount0, amount1])
    )
    const chainId = 1337
    const message = abiCoder.encode(['uint256', 'address', 'bytes32'], [chainId, sender.address, priceHash])
    const hashMessage = ethers.utils.keccak256(message)
    const signature = await signer.signMessage(ethers.utils.arrayify(hashMessage))

    return { priceHash, signature }
}

async function claimSignature(
    signer: Signer,
    index: number,
    sender: SignerWithAddress,
    filledAmount0: BigNumber,
    filledAmount1: BigNumber
): Promise<string> {
    const abiCoder = ethers.utils.defaultAbiCoder
    const chainId = 1337
    const message = abiCoder.encode(
        ['uint256', 'uint256', 'address', 'uint256', 'uint256'],
        [chainId, index, sender.address, filledAmount0, filledAmount1]
    )
    const hashMessage = ethers.utils.keccak256(message)

    return await signer.signMessage(ethers.utils.arrayify(hashMessage))
}

// Start test block
describe('BounceSealedBid', function () {
    let sealedBid: Contract
    let bounceStake: Contract
    let erc20Token: Contract
    let usdToken: Contract
    let owner: SignerWithAddress
    let governor: SignerWithAddress
    let creator: SignerWithAddress
    let bidder1: SignerWithAddress
    let bidder2: SignerWithAddress
    let bidder3: SignerWithAddress
    let w1: SignerWithAddress
    let w2: SignerWithAddress
    let w3: SignerWithAddress
    let w4: SignerWithAddress
    let signer: SignerWithAddress
    const ZERO_ADDRESS = ethers.constants.AddressZero
    const index = 0

    beforeEach(async function () {
        ;[owner, governor, creator, bidder1, bidder2, bidder3, w1, w2, w3, w4, signer] = await ethers.getSigners()

        // Load compiled artifacts
        const BounceSealedBid = await ethers.getContractFactory('BounceSealedBid')
        const ERC20 = await ethers.getContractFactory(ERC20PresetMinterPauser.abi, ERC20PresetMinterPauser.bytecode)
        const USDT = await ethers.getContractFactory(TetherToken.abi, TetherToken.bytecode)
        const BounceStake = await ethers.getContractFactory(BounceStakeSimple.abi, BounceStakeSimple.bytecode)

        // Deploy BounceSealedBid contract for each test
        sealedBid = await BounceSealedBid.deploy()
        // Deploy Bounce Stake contract for each test
        bounceStake = await BounceStake.deploy()
        // Deploy a ERC20 contract for each test
        erc20Token = await ERC20.deploy('Auction Token', 'AUCTION')
        usdToken = await USDT.deploy(usd('500000'), 'USD Token', 'USDT', 6)

        const txFeeRatio = ether('0.025')
        // initialize Bounce contract
        await sealedBid.initialize(txFeeRatio, bounceStake.address, signer.address)
        await expect(sealedBid.initialize(txFeeRatio, bounceStake.address, signer.address)).revertedWith(
            'Initializable: contract is already initialized'
        )
        await expect(sealedBid.connect(governor).transferOwnership(governor.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
        await sealedBid.transferOwnership(governor.address)
        expect(await sealedBid.owner()).to.be.equal(governor.address)
        expect(await sealedBid.txFeeRatio()).to.be.equal(ether('0.025'))
        expect(await sealedBid.stakeContract()).to.equal(bounceStake.address)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(sealedBid.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(bidder1.address, ether('10000'))
        await erc20Token.mint(bidder2.address, ether('10000'))
        await erc20Token.mint(bidder3.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(sealedBid.address, usd('10000'))
        await usdToken.transfer(creator.address, usd('10000'))
        await usdToken.transfer(bidder1.address, usd('10000'))
        await usdToken.transfer(bidder2.address, usd('10000'))
        await usdToken.transfer(bidder3.address, usd('10000'))
        await usdToken.transfer(w1.address, usd('10000'))
        await usdToken.transfer(w2.address, usd('10000'))
    })

    describe('ERC20/ETH pool with whitelist', function () {
        let hexProof: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('20')
            const amountMin1 = ether('10')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))

            const leaves = [w1.address, w2.address, w3.address, w4.address].map((addr) =>
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [addr]))
            )
            const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true })
            const root = tree.getRoot().toString('hex')
            const leaf = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w2.address]))
            hexProof = tree.getHexProof(leaf)
            const whitelistRoot = `0x${root}`

            const createReq = [name, token0, token1, amountTotal0, amountMin1, openAt, closeAt, claimAt, whitelistRoot]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.SealedBid], creator, expireAt)
            await erc20Token.connect(creator).approve(sealedBid.address, amountTotal0)
            await sealedBid
                .connect(creator)
                .createV2(
                    id,
                    createReq,
                    releaseType,
                    releaseData,
                    enableAuctionHolder,
                    enableReverse,
                    expireAt,
                    signature
                )
            const pool = await sealedBid.pools(index)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await sealedBid.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await sealedBid.creatorClaimed(index)).to.equal(false)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
        })

        it('when bid in whitelist should be ok', async function () {
            const amount0 = ether('10')
            const amount1 = ether('5')
            const { priceHash, signature } = await bidSignature(signer, index, w2, amount0, amount1)
            await time.increase(time.duration.hours(1))
            await sealedBid.connect(w2).bid(index, amount1, priceHash, signature, hexProof, { value: amount1 })
            expect(await sealedBid.myAmountBid1(w2.address, index)).to.be.equal(amount1)
            expect(await sealedBid.myPriceHash(w2.address, index)).to.be.equal(priceHash)
        })

        it('when bid not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = ether('10')
            const amount1 = ether('5')
            const { priceHash, signature } = await bidSignature(signer, index, bidder1, amount0, amount1)
            await expect(
                sealedBid.connect(bidder1).bid(index, amount1, priceHash, signature, hexProof, { value: amount1 })
            ).revertedWith('not whitelisted')
        })
    })

    describe('ERC20/ETH pool', function () {
        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('20')
            const amountMin1 = ether('10')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [name, token0, token1, amountTotal0, amountMin1, openAt, closeAt, claimAt, whitelistRoot]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.SealedBid], creator, expireAt)
            await erc20Token.connect(creator).approve(sealedBid.address, amountTotal0)
            await sealedBid
                .connect(creator)
                .createV2(
                    id,
                    createReq,
                    releaseType,
                    releaseData,
                    enableAuctionHolder,
                    enableReverse,
                    expireAt,
                    signature
                )
            const pool = await sealedBid.pools(index)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await sealedBid.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await sealedBid.creatorClaimed(index)).to.equal(false)
            // expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            // expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            // expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
        })

        it('bid should be ok', async function () {
            let amount0 = ether('10')
            let amount1 = ether('5')
            const { priceHash: priceHash_1, signature: signature_1 } = await bidSignature(
                signer,
                index,
                bidder1,
                amount0,
                amount1
            )
            await time.increase(time.duration.hours(1))
            await sealedBid.connect(bidder1).bid(index, amount1, priceHash_1, signature_1, [], { value: amount1 })
            expect(await sealedBid.myAmountBid1(bidder1.address, index)).to.be.equal(amount1)
            expect(await sealedBid.myPriceHash(bidder1.address, index)).to.be.equal(priceHash_1)

            amount0 = ether('2')
            amount1 = ether('2')
            const { priceHash: priceHash_2, signature: signature_2 } = await bidSignature(
                signer,
                index,
                bidder2,
                amount0,
                amount1
            )
            await sealedBid.connect(bidder2).bid(index, amount1, priceHash_2, signature_2, [], { value: amount1 })
            expect(await sealedBid.myAmountBid1(bidder2.address, index)).to.be.equal(amount1)
            expect(await sealedBid.myPriceHash(bidder2.address, index)).to.be.equal(priceHash_2)

            await time.increase(time.duration.days(1))

            expect(await sealedBid.myClaimed(bidder1.address, index)).to.equal(false)
            const filledAmount0_1 = ether('1')
            const filledAmount1_1 = ether('1')
            const ucSignature_1 = claimSignature(signer, index, bidder1, filledAmount0_1, filledAmount1_1)
            await sealedBid.connect(bidder1).userClaim(index, filledAmount0_1, filledAmount1_1, ucSignature_1)
            expect(await sealedBid.myClaimed(bidder1.address, index)).to.equal(true)
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10001'))

            expect(await sealedBid.myClaimed(bidder2.address, index)).to.equal(false)
            const filledAmount0_2 = ether('1')
            const filledAmount1_2 = ether('1')
            const ucSignature_2 = claimSignature(signer, index, bidder2, filledAmount0_2, filledAmount1_2)
            await sealedBid.connect(bidder2).userClaim(index, filledAmount0_2, filledAmount1_2, ucSignature_2)
            expect(await sealedBid.myClaimed(bidder2.address, index)).to.equal(true)
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10001'))

            const filledAmount0 = ether('2')
            const filledAmount1 = ether('2')
            const ccSignature = claimSignature(signer, index, creator, filledAmount0, filledAmount1)
            expect(await sealedBid.creatorClaimed(index)).to.equal(false)
            await sealedBid.connect(creator).creatorClaim(index, filledAmount0, filledAmount1, ccSignature)
            expect(await sealedBid.creatorClaimed(index)).to.equal(true)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9998'))
        })

        it('bid when pool not open should revert', async function () {
            let amount0 = ether('10')
            let amount1 = ether('5')
            const { priceHash: priceHash_1, signature: signature_1 } = await bidSignature(
                signer,
                index,
                bidder1,
                amount0,
                amount1
            )
            await expect(
                sealedBid.connect(bidder1).bid(index, amount1, priceHash_1, signature_1, [], { value: amount1 })
            ).revertedWith('pool not open')
        })
    })
})
