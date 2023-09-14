import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import TetherToken from './abis/TetherToken.json'
import BounceStakeSimple from './abis/BounceStakeSimple.json'
import ERC20PresetMinterPauser from '../node_modules/@openzeppelin/contracts/build/contracts/ERC20PresetMinterPauser.json'
import { MerkleTree } from 'merkletreejs'
import { KEYHASH_ADDRESS } from '../constants/constants'
import { ether, PoolType, ReleaseType, sign, types, usd } from './utils'

describe('BounceLottery', function () {
    let mockVRFCoordinatorV2: Contract
    let linkToken: Contract
    let lottery: Contract
    let bounceStake: Contract
    let erc20Token: Contract
    let usdToken: Contract
    let owner: SignerWithAddress
    let governor: SignerWithAddress
    let creator: SignerWithAddress
    let buyer: SignerWithAddress
    let buyer2: SignerWithAddress
    let buyer3: SignerWithAddress
    let buyer4: SignerWithAddress
    let w1: SignerWithAddress
    let w2: SignerWithAddress
    let w3: SignerWithAddress
    let w4: SignerWithAddress
    let signer: SignerWithAddress
    const ZERO_ADDRESS = ethers.constants.AddressZero
    const index = 0

    beforeEach(async function () {
        ;[owner, governor, creator, buyer, buyer2, buyer3, buyer4, w1, w2, w3, w4, signer] = await ethers.getSigners()

        // Load compiled artifacts
        const VRFCoordinatorV2Mock = await ethers.getContractFactory('VRFCoordinatorV2Mock')
        const LinkToken = await ethers.getContractFactory('LinkToken')
        const BounceLottery = await ethers.getContractFactory('BounceLottery')
        const ERC20 = await ethers.getContractFactory(ERC20PresetMinterPauser.abi, ERC20PresetMinterPauser.bytecode)
        const USDT = await ethers.getContractFactory(TetherToken.abi, TetherToken.bytecode)
        const BounceStake = await ethers.getContractFactory(BounceStakeSimple.abi, BounceStakeSimple.bytecode)

        const chainId = 5
        const KEYHASH = KEYHASH_ADDRESS[chainId]

        // constructor's parameters: uint96 _baseFee, uint96 _gasPriceLink
        mockVRFCoordinatorV2 = await VRFCoordinatorV2Mock.deploy(100, 100)
        linkToken = await LinkToken.deploy()
        // Deploy BounceLottery contract for each test
        lottery = await BounceLottery.deploy()
        // Deploy Bounce Stake contract for each test
        bounceStake = await BounceStake.deploy()
        // Deploy a ERC20 contract for each test
        erc20Token = await ERC20.deploy('Auction Token', 'AUCTION')
        usdToken = await USDT.deploy(usd('500000'), 'USD Token', 'USDT', 6)

        const txFeeRatio = ether('0.025')
        await lottery.initialize(
            txFeeRatio,
            bounceStake.address,
            signer.address,
            mockVRFCoordinatorV2.address,
            linkToken.address,
            KEYHASH
        )
        await expect(
            lottery.initialize(
                txFeeRatio,
                bounceStake.address,
                signer.address,
                mockVRFCoordinatorV2.address,
                linkToken.address,
                KEYHASH
            )
        ).revertedWith('Initializable: contract is already initialized')
        // const sudId = await lottery.subId()
        // await lottery.topUpSubscription(sudId, ether('1'))
        await expect(lottery.connect(governor).transferOwnership(governor.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
        await lottery.transferOwnership(governor.address)
        expect(await lottery.owner()).to.be.equal(governor.address)
        expect(await lottery.txFeeRatio()).to.be.equal(ether('0.025'))
        expect(await lottery.stakeContract()).to.equal(bounceStake.address)
        expect(await lottery.coordinator()).to.equal(mockVRFCoordinatorV2.address)
        expect(await lottery.linkToken()).to.equal(linkToken.address)
        expect(await lottery.keyHash()).to.equal(KEYHASH)
        // expect(await lottery.callbackGasLimit()).to.equal(2500000)
        expect(await lottery.requestConfirmations()).to.equal(3)
        expect(await lottery.numWords()).to.equal(1)
        expect(await lottery.subId()).to.equal(1)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(lottery.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(buyer.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(creator.address, usd('10000'))
        await usdToken.transfer(buyer.address, usd('10000'))
        await usdToken.transfer(buyer2.address, usd('10000'))
        await usdToken.transfer(buyer3.address, usd('10000'))
        await usdToken.transfer(buyer4.address, usd('10000'))
        await usdToken.transfer(w1.address, usd('10000'))
        await usdToken.transfer(w2.address, usd('10000'))
    })

    describe('ERC20/ETH pool with whitelist', function () {
        let hexProof: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('10')
            const amount1PerWallet = ether('10')
            const maxPlayer = 50
            const nShare = 2
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
            const createReq = [
                name,
                token0,
                token1,
                amountTotal0,
                amount1PerWallet,
                openAt,
                closeAt,
                claimAt,
                maxPlayer,
                nShare,
                whitelistRoot,
            ]

            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.Random], creator, expireAt)
            await erc20Token.connect(creator).approve(lottery.address, amountTotal0)
            await lottery
                .connect(creator)
                .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            const pool = await lottery.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amount1PerWallet).to.be.equal(amount1PerWallet)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.maxPlayer).to.be.equal(maxPlayer)
            expect(pool.nShare).to.be.equal(nShare)
            expect(await lottery.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await lottery.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10010'))
        })

        it('bet in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await lottery.connect(w2).bet(index, hexProof, { value: amount1 })
            expect(await lottery.betNo(w2.address, index)).to.be.equal(1)
        })

        it('bet not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await expect(lottery.connect(buyer).bet(index, hexProof, { value: amount1 })).revertedWith(
                'not whitelisted'
            )
        })

        it('requestRandom should ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await lottery.connect(w2).bet(index, hexProof, { value: amount1 })
            await time.increase(time.duration.hours(10))
            const requestId = 1
            await expect(lottery.connect(w1).requestRandom(index))
                .to.emit(lottery, 'RandomRequested')
                .withArgs(index, w1.address, requestId)
        })

        it('requestRandom with pool not close should revert', async function () {
            await expect(lottery.requestRandom(index)).revertedWith('this pool is not closed')
        })

        it('requestRandom with no bet should revert', async function () {
            await time.increase(time.duration.hours(11))
            await expect(lottery.requestRandom(index)).revertedWith('no bet')
        })
    })

    describe('ERC20/ETH pool', function () {
        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('10')
            const amount1PerWallet = ether('10')
            const maxPlayer = 50
            const nShare = 2
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
                amount1PerWallet,
                openAt,
                closeAt,
                claimAt,
                maxPlayer,
                nShare,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.Random], creator, expireAt)
            await erc20Token.connect(creator).approve(lottery.address, amountTotal0)
            await lottery
                .connect(creator)
                .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            const pool = await lottery.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amount1PerWallet).to.be.equal(amount1PerWallet)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.maxPlayer).to.be.equal(maxPlayer)
            expect(pool.nShare).to.be.equal(nShare)
            expect(await lottery.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await lottery.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10010'))
        })

        it('bet should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await lottery.connect(buyer).bet(index, [], { value: amount1 })
            expect(await lottery.betNo(buyer.address, index)).to.be.equal(1)
        })

        it('re-bet should be revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await lottery.connect(buyer).bet(index, [], { value: amount1 })
            expect(await lottery.betNo(buyer.address, index)).to.be.equal(1)
            await expect(lottery.connect(buyer).bet(index, [], { value: amount1 })).revertedWith('already bet')
        })

        it('bet not open should throw exception', async function () {
            const amount1 = ether('10')
            await expect(lottery.connect(buyer).bet(index, [], { value: amount1 })).revertedWith('pool not open')
        })

        describe('claim pool ERC20/ETH', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = ether('10')
                await lottery.connect(buyer).bet(index, [], { value: amount1 })
                expect(await lottery.betNo(buyer.address, index)).to.be.equal(1)
                await lottery.connect(buyer2).bet(index, [], { value: amount1 })
                expect(await lottery.betNo(buyer2.address, index)).to.be.equal(2)
                await lottery.connect(buyer3).bet(index, [], { value: amount1 })
                expect(await lottery.betNo(buyer3.address, index)).to.be.equal(3)
                await lottery.connect(buyer4).bet(index, [], { value: amount1 })
                expect(await lottery.betNo(buyer4.address, index)).to.be.equal(4)

                const pool = await lottery.pools(index)
                expect(pool.curPlayer).to.equal(4)

                // let lo2 = await lottery.lo2(100);
                // console.log(`lo2: ${lo2}`);
                // for(let i = 0; i < 100; i++) {
                //     console.log(`calcRet: ${await lottery.calcRet(i, 100)}`);
                // }
            })

            it('creatorClaim should work', async function () {
                await time.increase(time.duration.hours(10))
                const amount0 = 0
                const amount1 = ether('19.5')
                const txFee = ether('0.5')
                await expect(lottery.connect(creator).creatorClaim(index))
                    .to.emit(lottery, 'CreatorClaimed')
                    .withArgs(index, creator.address, amount0, amount1, txFee)
            })

            it('creatorClaim when pool not close should revert', async function () {
                await expect(lottery.connect(creator).creatorClaim(index)).revertedWith('this pool is not closed')
            })

            it('creatorClaim with wrong creator should revert', async function () {
                await time.increase(time.duration.hours(10))
                await expect(lottery.connect(signer).creatorClaim(index)).revertedWith('invalid pool creator')
            })

            it('userClaim should work', async function () {
                await time.increase(time.duration.hours(10))

                const requestId = 1
                await expect(lottery.requestRandom(index))
                    .to.emit(lottery, 'RandomRequested')
                    .withArgs(index, owner.address, requestId)
                const subId = 1
                expect(subId).to.equal(1)
                const payment = 4038600
                await mockVRFCoordinatorV2.fundSubscription(subId, payment)
                await expect(mockVRFCoordinatorV2.fulfillRandomWords(requestId, lottery.address))
                    .to.emit(mockVRFCoordinatorV2, 'RandomWordsFulfilled')
                    .withArgs(requestId, requestId, payment, true)

                await time.increase(time.duration.hours(1))
                expect(await lottery.winnerSeed(index)).to.equal(2)

                await expect(lottery.connect(buyer).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer.address, 0, ether('10'))
                await expect(lottery.connect(buyer).userClaim(index)).revertedWith('claimed')
                await expect(lottery.connect(buyer2).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer2.address, ether('5'), 0)
                await expect(lottery.connect(buyer3).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer3.address, ether('5'), 0)
                await expect(lottery.connect(buyer4).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer4.address, 0, ether('10'))
            })

            it('userClaim not ready should revert', async function () {
                await expect(lottery.connect(buyer).userClaim(index)).revertedWith('claim not ready')
            })

            it('userClaim with no bet should revert', async function () {
                await time.increase(time.duration.hours(11))
                const requestId = 1
                await expect(lottery.requestRandom(index))
                    .to.emit(lottery, 'RandomRequested')
                    .withArgs(index, owner.address, requestId)
                const subId = 1
                const payment = 4038600
                await mockVRFCoordinatorV2.fundSubscription(subId, payment)
                await expect(mockVRFCoordinatorV2.fulfillRandomWords(requestId, lottery.address))
                    .to.emit(mockVRFCoordinatorV2, 'RandomWordsFulfilled')
                    .withArgs(requestId, requestId, payment, true)

                await expect(lottery.connect(signer).userClaim(index)).revertedWith('no bet')
            })
        })
    })

    describe('ERC20/USDT pool', function () {
        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = usdToken.address
            const amountTotal0 = ether('10')
            const amount1PerWallet = usd('10')
            const maxPlayer = 50
            const nShare = 2
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
                amount1PerWallet,
                openAt,
                closeAt,
                claimAt,
                maxPlayer,
                nShare,
                whitelistRoot,
            ]

            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.Random], creator, expireAt)
            await erc20Token.connect(creator).approve(lottery.address, amountTotal0)
            await lottery
                .connect(creator)
                .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)

            const pool = await lottery.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amount1PerWallet).to.be.equal(amount1PerWallet)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.maxPlayer).to.be.equal(maxPlayer)
            expect(pool.nShare).to.be.equal(nShare)
            expect(await lottery.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await lottery.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10010'))
        })

        it('bet should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = usd('10')
            await usdToken.connect(buyer).approve(lottery.address, amount1)
            await lottery.connect(buyer).bet(index, [])
            expect(await lottery.betNo(buyer.address, index)).to.be.equal(1)
        })

        it('re-bet should be revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = usd('10')
            await usdToken.connect(buyer).approve(lottery.address, amount1)
            await lottery.connect(buyer).bet(index, [])
            expect(await lottery.betNo(buyer.address, index)).to.be.equal(1)
            await expect(lottery.connect(buyer).bet(index, [], { value: amount1 })).revertedWith('already bet')
        })

        it('bet not open should throw exception', async function () {
            const amount1 = usd('10')
            await usdToken.connect(buyer).approve(lottery.address, amount1)
            await expect(lottery.connect(buyer).bet(index, [], { value: amount1 })).revertedWith('pool not open')
        })

        describe('claim pool ERC20/USDT', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = usd('10')

                await usdToken.connect(buyer).approve(lottery.address, amount1)
                await lottery.connect(buyer).bet(index, [])
                expect(await lottery.betNo(buyer.address, index)).to.be.equal(1)
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('10'))

                await usdToken.connect(buyer2).approve(lottery.address, amount1)
                await lottery.connect(buyer2).bet(index, [])
                expect(await lottery.betNo(buyer2.address, index)).to.be.equal(2)
                expect(await usdToken.balanceOf(buyer2.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('20'))

                await usdToken.connect(buyer3).approve(lottery.address, amount1)
                await lottery.connect(buyer3).bet(index, [])
                expect(await lottery.betNo(buyer3.address, index)).to.be.equal(3)
                expect(await usdToken.balanceOf(buyer3.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('30'))

                await usdToken.connect(buyer4).approve(lottery.address, amount1)
                await lottery.connect(buyer4).bet(index, [])
                expect(await lottery.betNo(buyer4.address, index)).to.be.equal(4)
                expect(await usdToken.balanceOf(buyer4.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('40'))

                const pool = await lottery.pools(index)
                expect(pool.curPlayer).to.equal(4)
            })

            it('creatorClaim should work', async function () {
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('40'))
                await time.increase(time.duration.hours(10))
                const amount0 = 0
                const amount1 = usd('19.5')
                const txFee = usd('0.5')
                await expect(lottery.connect(creator).creatorClaim(index))
                    .to.emit(lottery, 'CreatorClaimed')
                    .withArgs(index, creator.address, amount0, amount1, txFee)
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('20'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10019.5'))
                expect(await usdToken.balanceOf(bounceStake.address)).to.be.equal(usd('0.5'))
            })

            it('creatorClaim when pool not close should revert', async function () {
                await expect(lottery.connect(creator).creatorClaim(index)).revertedWith('this pool is not closed')
            })

            it('creatorClaim with wrong creator should revert', async function () {
                await time.increase(time.duration.hours(10))
                await expect(lottery.connect(signer).creatorClaim(index)).revertedWith('invalid pool creator')
            })

            it('userClaim should work', async function () {
                await time.increase(time.duration.hours(10))

                const requestId = 1
                await expect(lottery.requestRandom(index))
                    .to.emit(lottery, 'RandomRequested')
                    .withArgs(index, owner.address, requestId)
                const subId = 1
                const payment = 4038600
                await mockVRFCoordinatorV2.fundSubscription(subId, payment)
                await expect(mockVRFCoordinatorV2.fulfillRandomWords(requestId, lottery.address))
                    .to.emit(mockVRFCoordinatorV2, 'RandomWordsFulfilled')
                    .withArgs(requestId, requestId, payment, true)

                await time.increase(time.duration.hours(1))
                expect(await lottery.winnerSeed(index)).to.equal(2)

                expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10010'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('40'))

                // lose
                await expect(lottery.connect(buyer).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer.address, 0, usd('10'))
                await expect(lottery.connect(buyer).userClaim(index)).revertedWith('claimed')
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10010'))
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('10000'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('30'))

                // win
                await expect(lottery.connect(buyer2).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer2.address, ether('5'), 0)
                expect(await erc20Token.balanceOf(buyer2.address)).to.be.equal(ether('5'))
                expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10005'))
                expect(await usdToken.balanceOf(buyer2.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('30'))

                // win
                await expect(lottery.connect(buyer3).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer3.address, ether('5'), 0)
                expect(await erc20Token.balanceOf(buyer3.address)).to.be.equal(ether('5'))
                expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10000'))
                expect(await usdToken.balanceOf(buyer3.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('30'))

                // lose
                await expect(lottery.connect(buyer4).userClaim(index))
                    .to.emit(lottery, 'UserClaimed')
                    .withArgs(index, buyer4.address, 0, usd('10'))
                expect(await erc20Token.balanceOf(buyer4.address)).to.be.equal(ether('0'))
                expect(await erc20Token.balanceOf(lottery.address)).to.be.equal(ether('10000'))
                expect(await usdToken.balanceOf(buyer4.address)).to.be.equal(usd('10000'))
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('20'))

                const amount0 = 0
                const amount1 = usd('19.5')
                const txFee = usd('0.5')
                await expect(lottery.connect(creator).creatorClaim(index))
                    .to.emit(lottery, 'CreatorClaimed')
                    .withArgs(index, creator.address, amount0, amount1, txFee)
                expect(await usdToken.balanceOf(lottery.address)).to.be.equal(usd('0'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10019.5'))
                expect(await usdToken.balanceOf(bounceStake.address)).to.be.equal(usd('0.5'))
            })

            it('userClaim not ready should revert', async function () {
                await expect(lottery.connect(buyer).userClaim(index)).revertedWith('claim not ready')
            })

            it('userClaim with no bet should revert', async function () {
                await time.increase(time.duration.hours(11))
                const requestId = 1
                await expect(lottery.requestRandom(index))
                    .to.emit(lottery, 'RandomRequested')
                    .withArgs(index, owner.address, requestId)
                const subId = 1
                const payment = 4038600
                await mockVRFCoordinatorV2.fundSubscription(subId, payment)
                await expect(mockVRFCoordinatorV2.fulfillRandomWords(requestId, lottery.address))
                    .to.emit(mockVRFCoordinatorV2, 'RandomWordsFulfilled')
                    .withArgs(requestId, requestId, payment, true)

                await expect(lottery.connect(signer).userClaim(index)).revertedWith('no bet')
            })
        })
    })
})
