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

describe('BounceFixedSwap', function () {
    let fixedSwap: Contract
    let bounceStake: Contract
    let erc20Token: Contract
    let usdToken: Contract
    let owner: SignerWithAddress
    let newOwner: SignerWithAddress
    let creator: SignerWithAddress
    let buyer: SignerWithAddress
    let w1: SignerWithAddress
    let w2: SignerWithAddress
    let w3: SignerWithAddress
    let w4: SignerWithAddress
    let signer: SignerWithAddress
    let newSigner: SignerWithAddress
    let attacker: SignerWithAddress
    const ZERO_ADDRESS = ethers.constants.AddressZero
    const index = 0

    beforeEach(async function () {
        ;[owner, newOwner, creator, buyer, w1, w2, w3, w4, signer, newSigner, attacker] = await ethers.getSigners()

        // Load compiled artifacts
        const BounceFixedSwap = await ethers.getContractFactory('BounceFixedSwap')
        const ERC20 = await ethers.getContractFactory(ERC20PresetMinterPauser.abi, ERC20PresetMinterPauser.bytecode)
        const USDT = await ethers.getContractFactory(TetherToken.abi, TetherToken.bytecode)
        const BounceStake = await ethers.getContractFactory(BounceStakeSimple.abi, BounceStakeSimple.bytecode)

        // Deploy BounceFixedSwap contract for each test
        fixedSwap = await BounceFixedSwap.deploy()
        // Deploy Bounce Stake contract for each test
        bounceStake = await BounceStake.deploy()
        // Deploy a ERC20 contract for each test
        erc20Token = await ERC20.deploy('Auction Token', 'AUCTION')
        usdToken = await USDT.deploy(usd('500000'), 'USD Token', 'USDT', 6)

        const txFeeRatio = ether('0.025')
        // initialize Bounce contract
        await fixedSwap.initialize(txFeeRatio, bounceStake.address, signer.address)
        await expect(fixedSwap.initialize(txFeeRatio, bounceStake.address, signer.address)).revertedWith(
            'Initializable: contract is already initialized'
        )
        expect(await fixedSwap.owner()).to.be.equal(owner.address)
        expect(await fixedSwap.txFeeRatio()).to.be.equal(ether('0.025'))
        expect(await fixedSwap.stakeContract()).to.equal(bounceStake.address)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(fixedSwap.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(buyer.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(fixedSwap.address, usd('10000'))
        await usdToken.transfer(creator.address, usd('10000'))
        await usdToken.transfer(buyer.address, usd('10000'))
        await usdToken.transfer(w1.address, usd('10000'))
        await usdToken.transfer(w2.address, usd('10000'))
    })

    it('transferOwnership should be ok', async function () {
        await fixedSwap.transferOwnership(newOwner.address)
        expect(await fixedSwap.owner()).to.equal(newOwner.address)
    })

    it('transferOwnership by attacker should be ok', async function () {
        await expect(fixedSwap.connect(attacker).transferOwnership(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setTxFeeRatio should be ok', async function () {
        await fixedSwap.setTxFeeRatio(ether('0.2'))
        expect(await fixedSwap.txFeeRatio()).to.equal(ether('0.2'))
    })

    it('setTxFeeRatio by attacker should be ok', async function () {
        await expect(fixedSwap.connect(attacker).setTxFeeRatio(ether('0.2'))).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setStakeContract should be ok', async function () {
        await fixedSwap.setStakeContract(newOwner.address)
        expect(await fixedSwap.stakeContract()).to.equal(newOwner.address)
    })

    it('setStakeContract by attacker should be ok', async function () {
        await expect(fixedSwap.connect(attacker).setStakeContract(newOwner.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setSigner should be ok', async function () {
        await fixedSwap.setSigner(newSigner.address)
    })

    it('setSigner by attacker should be ok', async function () {
        await expect(fixedSwap.connect(attacker).setSigner(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    describe('ERC20/ETH pool with whitelist', function () {
        let hexProof: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('10')
            const amountTotal1 = ether('20')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = BigNumber.from('0')
            const maxAmount1PerWallet = ether('100')

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
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                maxAmount1PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Instant
            const releaseData: any[] = []
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwap], creator, expireAt)
            await erc20Token.connect(creator).approve(fixedSwap.address, amountTotal0)
            await fixedSwap
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
            const pool = await fixedSwap.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await fixedSwap.maxAmount1PerWalletP(index)).to.be.equal(maxAmount1PerWallet)
            expect(await fixedSwap.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwap.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10010'))
        })

        it('when swap in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await fixedSwap.connect(w2).swap(index, amount1, hexProof, { value: amount1 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('10'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(w2.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
        })

        it('when cancel should be ok', async function () {
            const amount1 = ether('10')
            expect(await fixedSwap.creatorClaimedP(index)).to.equal(false)
            await fixedSwap.connect(creator).creatorClaim(index)
            expect(await fixedSwap.creatorClaimedP(index)).to.equal(true)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(w2.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))

            await expect(fixedSwap.connect(w2).swap(index, amount1, hexProof, { value: amount1 })).revertedWith(
                'pool not open'
            )
            await time.increase(time.duration.hours(1))
            await expect(fixedSwap.connect(w2).swap(index, amount1, hexProof, { value: amount1 })).revertedWith(
                'pool canceled'
            )
        })

        it('when swap not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await expect(fixedSwap.connect(buyer).swap(index, amount1, hexProof, { value: amount1 })).revertedWith(
                'not whitelisted'
            )
        })
    })

    describe('ERC20/ETH pool', function () {
        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = ZERO_ADDRESS
            const amountTotal0 = ether('10')
            const amountTotal1 = ether('20')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = BigNumber.from('0')
            const maxAmount1PerWallet = ether('100')
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [
                name,
                token0,
                token1,
                amountTotal0,
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                maxAmount1PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Instant
            const releaseData: any[] = []
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwap], creator, expireAt)
            await erc20Token.connect(creator).approve(fixedSwap.address, amountTotal0)
            await fixedSwap
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
            const pool = await fixedSwap.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await fixedSwap.maxAmount1PerWalletP(index)).to.be.equal(maxAmount1PerWallet)
            expect(await fixedSwap.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwap.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10010'))
        })

        it('when swap ERC20/ETH should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('10'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
        })

        it('when swap ERC20/ETH less than 1 ether', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('0.1')
            await fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('0.05'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('0.1'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000.05'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10009.95'))
        })

        it('when swap ERC20/ETH exceeded 1', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('50')
            await fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('10'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('20'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10010'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
        })

        it('when swap ERC20/ETH exceeded 2', async function () {
            await time.increase(time.duration.hours(1))
            const amount1_1 = ether('9.999999')
            await fixedSwap.connect(buyer).swap(index, amount1_1, [], { value: amount1_1 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('4.9999995'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('9.999999'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10004.9999995'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005.0000005'))

            const amount1_2 = ether('10')
            await fixedSwap.connect(buyer).swap(index, amount1_2, [], { value: amount1_2 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('9.9999995'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('19.999999'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10009.9999995'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000.0000005'))

            const amount1_3 = ether('1')
            await fixedSwap.connect(buyer).swap(index, amount1_3, [], { value: amount1_3 })
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('10'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('20'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10010'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
        })

        it('when swap ERC20/ETH not open should throw exception', async function () {
            const amount1 = ether('10')
            await expect(fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })).revertedWith(
                'pool not open'
            )
        })

        describe('claim pool ERC20/ETH', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = ether('10')
                await fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('10'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
            })

            it('claim should work', async function () {
                expect(await fixedSwap.creatorClaimedP(index)).to.equal(false)
                await time.increase(time.duration.hours(10))
                await fixedSwap.connect(creator).creatorClaim(index)
                expect(await fixedSwap.creatorClaimedP(index)).to.equal(true)
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9995'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
            })

            it('claim during pool running should revert', async function () {
                await expect(fixedSwap.connect(creator).creatorClaim(index)).revertedWith(
                    'cannot claim during pool running'
                )
            })
        })

        describe('cancel pool ERC20/ETH', function () {
            beforeEach(async function () {
                await fixedSwap.connect(creator).creatorClaim(index)
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('0'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('0'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
            })

            it('swap should revert', async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = ether('10')
                await expect(fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })).to.revertedWith(
                    'pool canceled'
                )
            })
        })

        describe('reverse pool ERC20/ETH', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = ether('10')
                await fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('10'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
            })

            it('reverse should work', async function () {
                const amount0 = await fixedSwap.myAmountSwapped0(buyer.address, index)
                expect(amount0).to.be.equal(ether('5'))
                expect(await fixedSwap.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('10'))
                await erc20Token.connect(buyer).approve(fixedSwap.address, amount0)
                await fixedSwap.connect(buyer).reverse(index, amount0)
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('0'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('0'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10010'))
            })

            it('reverse when pool close should revert', async function () {
                await time.increase(time.duration.hours(10))
                const amount0 = await fixedSwap.myAmountSwapped0(buyer.address, index)
                await expect(fixedSwap.connect(buyer).reverse(index, amount0)).revertedWith('this pool is closed')
            })
        })
    })

    describe('ERC20/USDT pool', function () {
        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc20Token.address
            const token1 = usdToken.address
            const amountTotal0 = ether('10')
            const amountTotal1 = usd('20')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = BigNumber.from('0')
            const maxAmount1PerWallet = ether('0')
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [
                name,
                token0,
                token1,
                amountTotal0,
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                maxAmount1PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Instant
            const releaseData: any[] = []
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwap], creator, expireAt)
            await erc20Token.connect(creator).approve(fixedSwap.address, amountTotal0)
            await fixedSwap
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
            const pool = await fixedSwap.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect(pool.amountTotal0).to.be.equal(amountTotal0)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(await fixedSwap.maxAmount1PerWalletP(index)).to.be.equal(maxAmount1PerWallet)
            expect(await fixedSwap.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwap.getPoolCount()).to.be.equal(1)
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10010'))
        })

        it('when swap ERC20/USDT should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = usd('10')
            await usdToken.connect(buyer).approve(fixedSwap.address, amount1)
            await fixedSwap.connect(buyer).swap(index, amount1, [])
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('10'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
            expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9990'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
        })

        it('when swap ERC20/USDT less than 1 ether', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = usd('0.1')
            await usdToken.connect(buyer).approve(fixedSwap.address, amount1)
            await fixedSwap.connect(buyer).swap(index, amount1, [])
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('0.05'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('0.1'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000.05'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10009.95'))
            expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9999.9'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
        })

        it('when swap ERC20/USDT exceeded 1', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = usd('50')
            await usdToken.connect(buyer).approve(fixedSwap.address, amount1)
            await fixedSwap.connect(buyer).swap(index, amount1, [])
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('10'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('20'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10010'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
            expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9980'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
        })

        it('when swap ERC20/USDT exceeded 2', async function () {
            await time.increase(time.duration.hours(1))
            const amount1_1 = usd('9.999999')
            await usdToken.connect(buyer).approve(fixedSwap.address, amount1_1)
            await fixedSwap.connect(buyer).swap(index, amount1_1, [])
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('4.9999995'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('9.999999'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10004.9999995'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005.0000005'))
            expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9990.000001'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            const amount1_2 = usd('10')
            await usdToken.connect(buyer).approve(fixedSwap.address, amount1_2)
            await fixedSwap.connect(buyer).swap(index, amount1_2, [])
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('9.9999995'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('19.999999'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10009.9999995'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000.0000005'))
            expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9980.000001'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))

            const amount1_3 = usd('1')
            await usdToken.connect(buyer).approve(fixedSwap.address, amount1_3)
            await fixedSwap.connect(buyer).swap(index, amount1_3, [])
            expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('10'))
            expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('20'))
            expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
            expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10010'))
            expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
            expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9980'))
            expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
        })

        it('when swap ERC20/USDT not open should throw exception', async function () {
            const amount1 = usd('10')
            await expect(fixedSwap.connect(buyer).swap(index, amount1, [])).revertedWith('pool not open')
        })

        describe('claim pool ERC20/USDT', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = usd('10')
                await usdToken.connect(buyer).approve(fixedSwap.address, amount1)
                await fixedSwap.connect(buyer).swap(index, amount1, [])
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('10'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
            })

            it('claim should work', async function () {
                expect(await fixedSwap.creatorClaimedP(index)).to.equal(false)
                await time.increase(time.duration.hours(10))
                await fixedSwap.connect(creator).creatorClaim(index)
                expect(await fixedSwap.creatorClaimedP(index)).to.equal(true)
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9995'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10009.75'))
            })

            it('claim during pool running should revert', async function () {
                await expect(fixedSwap.connect(creator).creatorClaim(index)).revertedWith(
                    'cannot claim during pool running'
                )
            })
        })

        describe('cancel pool ERC20/USDT', function () {
            beforeEach(async function () {
                await fixedSwap.connect(creator).creatorClaim(index)
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('0'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('0'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10000'))
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('10000'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
            })

            it('swap should revert', async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = usd('10')
                await expect(fixedSwap.connect(buyer).swap(index, amount1, [], { value: amount1 })).to.revertedWith(
                    'pool canceled'
                )
            })
        })

        describe('reverse pool ERC20/USDT', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = usd('10')
                await usdToken.connect(buyer).approve(fixedSwap.address, amount1)
                await fixedSwap.connect(buyer).swap(index, amount1, [])
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('5'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(usd('10'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10005'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10005'))
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('9990'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
            })

            it('reverse should work', async function () {
                const amount0 = await fixedSwap.myAmountSwapped0(buyer.address, index)
                expect(amount0).to.be.equal(ether('5'))
                expect(await fixedSwap.myAmountSwapped1(buyer.address, index)).to.be.equal(usd('10'))
                await erc20Token.connect(buyer).approve(fixedSwap.address, amount0)
                await fixedSwap.connect(buyer).reverse(index, amount0)
                expect(await fixedSwap.amountSwap0P(index)).to.be.equal(ether('0'))
                expect(await fixedSwap.amountSwap1P(index)).to.be.equal(ether('0'))
                expect(await erc20Token.balanceOf(creator.address)).to.be.equal(ether('9990'))
                expect(await erc20Token.balanceOf(buyer.address)).to.be.equal(ether('10000'))
                expect(await erc20Token.balanceOf(fixedSwap.address)).to.be.equal(ether('10010'))
                expect(await usdToken.balanceOf(buyer.address)).to.be.equal(usd('10000'))
                expect(await usdToken.balanceOf(creator.address)).to.be.equal(usd('10000'))
            })

            it('reverse when pool close should revert', async function () {
                await time.increase(time.duration.hours(10))
                const amount0 = await fixedSwap.myAmountSwapped0(buyer.address, index)
                await expect(fixedSwap.connect(buyer).reverse(index, amount0)).revertedWith('this pool is closed')
            })
        })
    })
})
