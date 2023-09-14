import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import TetherToken from './abis/TetherToken.json'
import BounceStakeSimple from './abis/BounceStakeSimple.json'
import ERC20PresetMinterPauser from '../node_modules/@openzeppelin/contracts/build/contracts/ERC20PresetMinterPauser.json'
import { MerkleTree } from 'merkletreejs'
import { ether, PoolType, ReleaseType, sign, types, usd } from './utils'

// Start test block
describe('BounceDutchAuction', function () {
    let dutchAuction: Contract
    let bounceStake: Contract
    let erc20Token: Contract
    let usdToken: Contract
    let owner: SignerWithAddress
    let governor: SignerWithAddress
    let creator: SignerWithAddress
    let bidder1: SignerWithAddress
    let bidder2: SignerWithAddress
    let w1: SignerWithAddress
    let w2: SignerWithAddress
    let w3: SignerWithAddress
    let w4: SignerWithAddress
    let signer: SignerWithAddress
    const ZERO_ADDRESS = ethers.constants.AddressZero

    beforeEach(async function () {
        ;[owner, governor, creator, bidder1, bidder2, w1, w2, w3, w4, signer] = await ethers.getSigners()

        const BounceDutchAuction = await ethers.getContractFactory('BounceDutchAuction')
        const ERC20 = await ethers.getContractFactory(ERC20PresetMinterPauser.abi, ERC20PresetMinterPauser.bytecode)
        const USDT = await ethers.getContractFactory(TetherToken.abi, TetherToken.bytecode)
        const BounceStake = await ethers.getContractFactory(BounceStakeSimple.abi, BounceStakeSimple.bytecode)

        // Deploy BounceDutchAuction contract for each test
        dutchAuction = await BounceDutchAuction.deploy()
        // Deploy Bounce Stake contract for each test
        bounceStake = await BounceStake.deploy()
        // Deploy a ERC20 contract for each test
        erc20Token = await ERC20.deploy('Auction Token', 'AUCTION')
        usdToken = await USDT.deploy(usd('500000'), 'USD Token', 'USDT', 6)

        const txFeeRatio = ether('0.025')
        // initialize Bounce contract
        await dutchAuction.initialize(txFeeRatio, bounceStake.address, signer.address)
        await expect(dutchAuction.initialize(txFeeRatio, bounceStake.address, signer.address)).revertedWith(
            'Initializable: contract is already initialized'
        )
        await expect(dutchAuction.connect(governor).transferOwnership(governor.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
        await dutchAuction.transferOwnership(governor.address)
        expect(await dutchAuction.owner()).to.be.equal(governor.address)
        expect(await dutchAuction.txFeeRatio()).to.be.equal(ether('0.025'))
        expect(await dutchAuction.stakeContract()).to.equal(bounceStake.address)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(dutchAuction.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(bidder1.address, ether('10000'))
        await erc20Token.mint(bidder2.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(dutchAuction.address, usd('10000'))
        await usdToken.transfer(creator.address, usd('10000'))
        await usdToken.transfer(bidder1.address, usd('10000'))
        await usdToken.transfer(bidder2.address, usd('10000'))
        await usdToken.transfer(w1.address, usd('10000'))
        await usdToken.transfer(w2.address, usd('10000'))
    })

    describe('ERC20/ETH pool with whitelist', function () {
        let hexProof: any
        const index = 0

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('20')
            const amountMax1 = ether('20')
            const amountMin1 = ether('10')
            const times = 4
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const index = 0

            const leaves = [w3.address, w2.address, w1.address].map((addr) =>
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [addr]))
            )
            const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true })
            const root = tree.getRoot().toString('hex')
            const leaf = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w1.address]))
            hexProof = tree.getHexProof(leaf)

            const whitelistRoot = `0x${root}`
            const createReq = [
                name,
                token0,
                token1,
                amountTotal0,
                amountMax1,
                amountMin1,
                times,
                openAt,
                closeAt,
                claimAt,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.DutchAuction], creator, expireAt)
            await erc20Token.connect(creator).approve(dutchAuction.address, amountTotal0)
            await dutchAuction
                .connect(creator)
                .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            const pool = await dutchAuction.pools(index)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountMax1).to.be.equal(amountMax1)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await dutchAuction.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await dutchAuction.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
        })

        it('when bid in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            let amount0 = ether('1')
            const [amount1, currentPrice] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1).to.be.equal(ether('1'))
            expect(currentPrice).to.be.equal(ether('1'))
            await dutchAuction.connect(w1).bid(index, amount0, hexProof, { value: amount1 })

            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('1'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('1'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await erc20Token.balanceOf(w2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
        })

        it('when bid not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = ether('1')
            const [amount1] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1).to.be.equal(ether('1'))
            await expect(dutchAuction.connect(bidder1).bid(index, amount0, hexProof, { value: amount1 })).revertedWith(
                'not whitelisted'
            )
        })
    })

    describe('ERC20/ETH pool', function () {
        const index = 0

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('20')
            const amountMax1 = ether('20')
            const amountMin1 = ether('10')
            const times = 4
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [
                name,
                token0,
                token1,
                amountTotal0,
                amountMax1,
                amountMin1,
                times,
                openAt,
                closeAt,
                claimAt,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.DutchAuction], creator, expireAt)
            await erc20Token.connect(creator).approve(dutchAuction.address, amountTotal0)
            await dutchAuction
                .connect(creator)
                .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            const pool = await dutchAuction.pools(index)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountMax1).to.be.equal(amountMax1)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.times).to.be.equal(times)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await dutchAuction.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await dutchAuction.creatorClaimed(index)).to.equal(false)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
        })

        it('when bid ERC20/ETH 1', async function () {
            await time.increase(time.duration.hours(1))
            let amount0 = ether('1')
            let [amount1_1, currentPrice_1] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_1).to.be.equal(ether('1'))
            expect(currentPrice_1).to.be.equal(ether('1'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await dutchAuction.currentPrice(index)).to.be.equal(ether('1'))

            await dutchAuction.connect(bidder1).bid(index, amount0, [], { value: amount1_1 })
            expect(await dutchAuction.myAmountSwap0(bidder1.address, index)).to.be.equal(ether('1'))
            expect(await dutchAuction.myAmountSwap1(bidder1.address, index)).to.be.equal(ether('1'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('1'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('1'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(ether('1'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))

            await time.increase(time.duration.hours(2.5))
            let [amount1_2, currentPrice_2] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_2).to.be.equal(ether('0.875'))
            expect(currentPrice_2).to.be.equal(ether('0.875'))
            await dutchAuction.connect(bidder2).bid(index, amount0, [], { value: amount1_2 })
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('1'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(ether('0.875'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('2'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('1.875'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(ether('0.875'))

            await time.increase(time.duration.hours(2.5))
            let [amount1_3, currentPrice_3] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_3).to.be.equal(ether('0.75'))
            expect(currentPrice_3).to.be.equal(ether('0.75'))
            await dutchAuction.connect(bidder2).bid(index, amount0, [], { value: amount1_3 })
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('2'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(ether('1.625'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('3'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('2.625'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(ether('0.75'))

            await time.increase(time.duration.hours(2.5))
            let [amount1_4, currentPrice_4] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_4).to.be.equal(ether('0.625'))
            expect(currentPrice_4).to.be.equal(ether('0.625'))
            await dutchAuction.connect(bidder2).bid(index, amount0, [], { value: amount1_4 })
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('3'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(ether('2.25'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('4'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('3.25'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(ether('0.625'))

            await time.increase(time.duration.hours(1.5))
            let [amount1_5, currentPrice_5] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_5).to.be.equal(ether('0.5'))
            expect(currentPrice_5).to.be.equal(ether('0.5'))
            await dutchAuction.connect(bidder2).bid(index, amount0, [], { value: amount1_5 })
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('4'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(ether('2.75'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('5'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('3.75'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(ether('0.5'))

            await time.increase(time.duration.seconds(5))
            let [amount1_6, currentPrice_6] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_6).to.be.equal(ether('0.5'))
            expect(currentPrice_6).to.be.equal(ether('0.5'))
            await dutchAuction.connect(bidder2).bid(index, amount0, [], { value: amount1_6 })
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('5'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(ether('3.25'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('6'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('4.25'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(ether('0.5'))

            await expect(dutchAuction.connect(creator).creatorClaim(index)).revertedWith('this pool is not closed')
            await expect(dutchAuction.connect(bidder1).creatorClaim(1)).revertedWith('this pool does not exist')
            await time.increase(time.duration.hours(2.5))
            await expect(dutchAuction.connect(bidder2).bid(index, amount0, [], { value: amount1_6 })).revertedWith(
                'this pool is closed'
            )
            await expect(dutchAuction.connect(bidder1).creatorClaim(index)).revertedWith('invalid pool creator')
            await dutchAuction.connect(creator).creatorClaim(index)
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10006'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9994'))
            await expect(dutchAuction.connect(creator).creatorClaim(index)).revertedWith('creator claimed')

            expect(await dutchAuction.myClaimed(bidder1.address, index)).to.equal(false)
            await dutchAuction.connect(bidder1).userClaim(index)
            expect(await dutchAuction.myClaimed(bidder1.address, index)).to.equal(true)
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10001'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9994'))
            await expect(dutchAuction.connect(bidder1).userClaim(index)).revertedWith('bidder claimed')

            expect(await dutchAuction.myClaimed(bidder2.address, index)).to.equal(false)
            await dutchAuction.connect(bidder2).userClaim(index)
            expect(await dutchAuction.myClaimed(bidder2.address, index)).to.equal(true)
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10001'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9994'))
            await expect(dutchAuction.connect(bidder2).userClaim(index)).revertedWith('bidder claimed')
        })

        it('when no bid', async function () {
            await time.increase(time.duration.days(1))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('0'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('0'))
            const amount0 = ether('20')
            const amount1 = ether('0')
            const txFee = ether('0')
            await expect(dutchAuction.connect(creator).creatorClaim(index))
                .to.emit(dutchAuction, 'CreatorClaimed')
                .withArgs(index, creator.address, amount0, amount1, txFee)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('10000'))
        })
    })

    describe('ERC20/USDT pool', function () {
        const index = 0

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = usdToken.address
            const amountTotal0 = ether('20')
            const amountMax1 = usd('20')
            const amountMin1 = usd('10')
            const times = 4
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const whitelistRoot = ethers.constants.HashZero
            const index = 0
            const createReq = [
                name,
                token0,
                token1,
                amountTotal0,
                amountMax1,
                amountMin1,
                times,
                openAt,
                closeAt,
                claimAt,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.DutchAuction], creator, expireAt)
            await erc20Token.connect(creator).approve(dutchAuction.address, amountTotal0)
            await dutchAuction
                .connect(creator)
                .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            const pool = await dutchAuction.pools(index)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountMax1).to.be.equal(amountMax1)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.times).to.be.equal(times)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await dutchAuction.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await dutchAuction.creatorClaimed(index)).to.equal(false)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('10000'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('10000'))
        })

        it('when bid ERC20/USDT 1', async function () {
            await time.increase(time.duration.hours(1))
            let amount0 = ether('1')
            let [amount1_1, currentPrice_1] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_1).to.be.equal(usd('1'))
            expect(currentPrice_1).to.be.equal(usd('1'))
            await usdToken.connect(bidder1).approve(dutchAuction.address, amount1_1)
            await dutchAuction.connect(bidder1).bid(index, amount0, [])
            expect(await dutchAuction.myAmountSwap0(bidder1.address, index)).to.be.equal(ether('1'))
            expect(await dutchAuction.myAmountSwap1(bidder1.address, index)).to.be.equal(usd('1'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('1'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(usd('1'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(usd('1'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10001'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('10000'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            await time.increase(time.duration.hours(2.5))
            let [amount1_2, currentPrice_2] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_2).to.be.equal(usd('0.875'))
            expect(currentPrice_2).to.be.equal(usd('0.875'))
            await usdToken.connect(bidder2).approve(dutchAuction.address, amount1_2)
            await dutchAuction.connect(bidder2).bid(index, amount0, [])
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('1'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(usd('0.875'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('2'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(usd('1.875'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(usd('0.875'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10001.875'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9999.125'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            await time.increase(time.duration.hours(1.5))
            let [amount1_3, currentPrice_3] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_3).to.be.equal(usd('0.75'))
            expect(currentPrice_3).to.be.equal(usd('0.75'))
            await usdToken.connect(bidder2).approve(dutchAuction.address, amount1_3)
            await dutchAuction.connect(bidder2).bid(index, amount0, [])
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('2'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(usd('1.625'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('3'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(usd('2.625'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(usd('0.75'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10002.625'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9998.375'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            await time.increase(time.duration.hours(2.5))
            let [amount1_4, currentPrice_4] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_4).to.be.equal(usd('0.625'))
            expect(currentPrice_4).to.be.equal(usd('0.625'))
            await usdToken.connect(bidder2).approve(dutchAuction.address, amount1_4)
            await dutchAuction.connect(bidder2).bid(index, amount0, [])
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('3'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(usd('2.25'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('4'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(usd('3.25'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(usd('0.625'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10003.25'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9997.75'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            await time.increase(time.duration.hours(2.5))
            expect(await dutchAuction.currentPrice(index)).to.be.equal(usd('0.5'))
            let [amount1_5, currentPrice_5] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_5).to.be.equal(usd('0.5'))
            expect(currentPrice_5).to.be.equal(usd('0.5'))
            await usdToken.connect(bidder2).approve(dutchAuction.address, amount1_5)
            await dutchAuction.connect(bidder2).bid(index, amount0, [])
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('4'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(usd('2.75'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('5'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(usd('3.75'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(usd('0.5'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10003.75'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9997.25'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            let [amount1_6, currentPrice_6] = await dutchAuction.queryAmount1AndCurrentPrice(index, amount0)
            expect(amount1_6).to.be.equal(usd('0.5'))
            expect(currentPrice_6).to.be.equal(usd('0.5'))
            await usdToken.connect(bidder2).approve(dutchAuction.address, amount1_6)
            await dutchAuction.connect(bidder2).bid(index, amount0, [])
            expect(await dutchAuction.myAmountSwap0(bidder2.address, index)).to.be.equal(ether('5'))
            expect(await dutchAuction.myAmountSwap1(bidder2.address, index)).to.be.equal(usd('3.25'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('6'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(usd('4.25'))
            expect(await dutchAuction.lowestBidPrice(index)).to.be.equal(usd('0.5'))
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10020'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10004.25'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9996.75'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            await expect(dutchAuction.connect(creator).creatorClaim(index)).revertedWith('this pool is not closed')
            await expect(dutchAuction.connect(creator).creatorClaim(1)).revertedWith('this pool does not exist')
            await time.increase(time.duration.hours(2.5))
            await expect(dutchAuction.connect(bidder2).bid(index, amount0, [])).revertedWith('this pool is closed')
            await expect(dutchAuction.connect(bidder1).creatorClaim(index)).revertedWith('invalid pool creator')
            await dutchAuction.connect(creator).creatorClaim(index)
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10006'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9994'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10001.25'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9996.75'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10002.925'))
            await expect(dutchAuction.connect(creator).creatorClaim(index)).revertedWith('creator claimed')

            expect(await dutchAuction.myClaimed(bidder1.address, index)).to.equal(false)
            await dutchAuction.connect(bidder1).userClaim(index)
            expect(await dutchAuction.myClaimed(bidder1.address, index)).to.equal(true)
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10001'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9994'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10000.75'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999.5'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9996.75'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10002.925'))
            await expect(dutchAuction.connect(bidder1).userClaim(index)).revertedWith('bidder claimed')

            expect(await dutchAuction.myClaimed(bidder2.address, index)).to.equal(false)
            await dutchAuction.connect(bidder2).userClaim(index)
            expect(await dutchAuction.myClaimed(bidder2.address, index)).to.equal(true)
            expect(await erc20Token.balanceOf(dutchAuction.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(bidder1.address)).to.be.equal(ether('10001'))
            expect(await erc20Token.balanceOf(bidder2.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9994'))
            expect(await usdToken.balanceOf(dutchAuction.address)).to.be.equal(usd('10000'))
            expect(await usdToken.balanceOf(bidder1.address)).to.be.equal(usd('9999.500000'))
            expect(await usdToken.balanceOf(bidder2.address)).to.be.equal(usd('9997.5'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10002.925'))
            await expect(dutchAuction.connect(bidder2).userClaim(index)).revertedWith('bidder claimed')
        })

        it('when no bid', async function () {
            await time.increase(time.duration.days(1))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9980'))
            expect(await dutchAuction.amountSwap0(index)).to.be.equal(ether('0'))
            expect(await dutchAuction.amountSwap1(index)).to.be.equal(ether('0'))
            const amount0 = ether('20')
            const amount1 = usd('0')
            const txFee = usd('0')
            await expect(dutchAuction.connect(creator).creatorClaim(index))
                .to.emit(dutchAuction, 'CreatorClaimed')
                .withArgs(index, creator.address, amount0, amount1, txFee)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('10000'))
        })
    })
})
