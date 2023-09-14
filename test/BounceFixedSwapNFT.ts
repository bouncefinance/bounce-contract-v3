import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import TetherToken from './abis/TetherToken.json'
import BounceStakeSimple from './abis/BounceStakeSimple.json'
import ERC20PresetMinterPauser from '../node_modules/@openzeppelin/contracts/build/contracts/ERC20PresetMinterPauser.json'
import ERC721PresetMinterPauserAutoId from '../node_modules/@openzeppelin/contracts/build/contracts/ERC721PresetMinterPauserAutoId.json'
import ERC1155PresetMinterPauser from '../node_modules/@openzeppelin/contracts/build/contracts/ERC1155PresetMinterPauser.json'
import { MerkleTree } from 'merkletreejs'
import { ether, PoolType, ReleaseType, sign, types, usd } from './utils'

describe('BounceFixedSwapNFT', function () {
    let fixedSwapNFT: Contract
    let bounceStake: Contract
    let erc20Token: Contract
    let erc721Token: Contract
    let erc1155Token: Contract
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
        const BounceFixedSwapNFT = await ethers.getContractFactory('BounceFixedSwapNFT')
        const ERC20 = await ethers.getContractFactory(ERC20PresetMinterPauser.abi, ERC20PresetMinterPauser.bytecode)
        const ERC721 = await ethers.getContractFactory(
            ERC721PresetMinterPauserAutoId.abi,
            ERC721PresetMinterPauserAutoId.bytecode
        )
        const ERC1155 = await ethers.getContractFactory(
            ERC1155PresetMinterPauser.abi,
            ERC1155PresetMinterPauser.bytecode
        )
        const USDT = await ethers.getContractFactory(TetherToken.abi, TetherToken.bytecode)
        const BounceStake = await ethers.getContractFactory(BounceStakeSimple.abi, BounceStakeSimple.bytecode)

        // Deploy BounceFixedSwapNFT contract for each test
        fixedSwapNFT = await BounceFixedSwapNFT.deploy()
        // Deploy Bounce Stake contract for each test
        bounceStake = await BounceStake.deploy()
        // Deploy a ERC20 contract for each test
        erc20Token = await ERC20.deploy('Auction Token', 'AUCTION')
        usdToken = await USDT.deploy(usd('500000'), 'USD Token', 'USDT', 6)
        // Deploy a NFT contract for each test
        erc721Token = await ERC721.deploy('ERC721 Token', '721', '')
        erc1155Token = await ERC1155.deploy('ERC1155 Token')

        const txFeeRatio = ether('0.025')
        // initialize Bounce contract
        await fixedSwapNFT.initialize(txFeeRatio, bounceStake.address, signer.address)

        await expect(fixedSwapNFT.initialize(txFeeRatio, bounceStake.address, signer.address)).revertedWith(
            'Initializable: contract is already initialized'
        )
        expect(await fixedSwapNFT.owner()).to.be.equal(owner.address)
        expect(await fixedSwapNFT.txFeeRatio()).to.be.equal(ether('0.025'))
        expect(await fixedSwapNFT.stakeContract()).to.equal(bounceStake.address)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(fixedSwapNFT.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(buyer.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(fixedSwapNFT.address, usd('10000'))
        await usdToken.transfer(creator.address, usd('10000'))
        await usdToken.transfer(buyer.address, usd('10000'))
        await usdToken.transfer(w1.address, usd('10000'))
        await usdToken.transfer(w2.address, usd('10000'))

        // mint ERC721 token
        for (let i = 0; i < 10; i++) {
            await erc721Token.mint(creator.address)
            expect(await erc721Token.ownerOf(i)).to.equal(creator.address)
        }
        expect(await erc721Token.balanceOf(creator.address)).to.be.equal(10)

        // mint ERC1155 token
        await erc1155Token.mint(creator.address, 0, 10, [])
        await erc1155Token.mint(creator.address, 1, 20, [])
        await erc1155Token.mint(creator.address, 2, 30, [])
        expect(await erc1155Token.balanceOf(creator.address, 0)).to.equal(10)
        expect(await erc1155Token.balanceOf(creator.address, 1)).to.equal(20)
        expect(await erc1155Token.balanceOf(creator.address, 2)).to.equal(30)
    })

    it('transferOwnership should be ok', async function () {
        await fixedSwapNFT.transferOwnership(newOwner.address)
        expect(await fixedSwapNFT.owner()).to.equal(newOwner.address)
    })

    it('transferOwnership by attacker should be ok', async function () {
        await expect(fixedSwapNFT.connect(attacker).transferOwnership(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setTxFeeRatio should be ok', async function () {
        await fixedSwapNFT.setTxFeeRatio(ether('0.2'))
        expect(await fixedSwapNFT.txFeeRatio()).to.equal(ether('0.2'))
    })

    it('setTxFeeRatio by attacker should be ok', async function () {
        await expect(fixedSwapNFT.connect(attacker).setTxFeeRatio(ether('0.2'))).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setStakeContract should be ok', async function () {
        await fixedSwapNFT.setStakeContract(newOwner.address)
        expect(await fixedSwapNFT.stakeContract()).to.equal(newOwner.address)
    })

    it('setStakeContract by attacker should be ok', async function () {
        await expect(fixedSwapNFT.connect(attacker).setStakeContract(newOwner.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setSigner should be ok', async function () {
        await fixedSwapNFT.setSigner(newSigner.address)
    })

    it('setSigner by attacker should be ok', async function () {
        await expect(fixedSwapNFT.connect(attacker).setSigner(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    describe('ERC721/ETH pool with whitelist', function () {
        let hexProof: any
        let tokenIds: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc721Token.address
            const token1 = ZERO_ADDRESS
            tokenIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
            const amountTotal0 = tokenIds.length
            const amountTotal1 = ether('10')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = BigNumber.from('0')
            const isERC721 = true
            const maxAmount0PerWallet = ether('100')

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
                tokenIds,
                amountTotal0,
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                maxAmount0PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Instant
            const releaseData: any[] = []
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwapNFT], creator, expireAt)
            await erc721Token.connect(creator).setApprovalForAll(fixedSwapNFT.address, true)
            await expect(
                fixedSwapNFT
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
            ).to.emit(fixedSwapNFT, 'Created')
            const pool = await fixedSwapNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect((await fixedSwapNFT.getTokenIdsByIndex(0)).length).to.be.equal(tokenIds.length)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(true)
            expect(await fixedSwapNFT.maxAmount0PerWallet(index)).to.be.equal(maxAmount0PerWallet)
            expect(await fixedSwapNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwapNFT.getPoolCount()).to.be.equal(1)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
            }
        })

        it('when swap in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 0b0000001111111111
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 }))
                .to.emit(fixedSwapNFT, 'Swapped')
                .withArgs(index, w2.address, amount0, amount1)
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(0b0000001111111111)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
            expect(await fixedSwapNFT.myAmountSwapped0(w2.address, index)).to.be.equal(0b0000001111111111)
            expect(await fixedSwapNFT.myAmountSwapped1(w2.address, index)).to.be.equal(ether('10'))
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 })).revertedWith(
                'swap amount is zero'
            )
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(w2.address)
            }
        })

        it('when partial swap in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            let amount0: number | string = 0b0000001010000011
            let amount1 = ether('4')
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 }))
                .to.emit(fixedSwapNFT, 'Swapped')
                .withArgs(index, w2.address, amount0, amount1)
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(0b0000001010000011)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('4'))
            expect(await fixedSwapNFT.myAmountSwapped0(w2.address, index)).to.be.equal(0b0000001010000011)
            expect(await fixedSwapNFT.myAmountSwapped1(w2.address, index)).to.be.equal(ether('4'))

            // double swap with no swapped token
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 }))
                .to.emit(fixedSwapNFT, 'Swapped')
                .withArgs(index, w2.address, 0, 0)

            expect(await erc721Token.ownerOf(0)).to.equal(w2.address)
            expect(await erc721Token.ownerOf(1)).to.equal(w2.address)
            expect(await erc721Token.ownerOf(2)).to.equal(fixedSwapNFT.address)
            expect(await erc721Token.ownerOf(3)).to.equal(fixedSwapNFT.address)
            expect(await erc721Token.ownerOf(4)).to.equal(fixedSwapNFT.address)
            expect(await erc721Token.ownerOf(5)).to.equal(fixedSwapNFT.address)
            expect(await erc721Token.ownerOf(6)).to.equal(fixedSwapNFT.address)
            expect(await erc721Token.ownerOf(7)).to.equal(w2.address)
            expect(await erc721Token.ownerOf(8)).to.equal(fixedSwapNFT.address)
            expect(await erc721Token.ownerOf(9)).to.equal(w2.address)

            amount0 = ethers.constants.MaxUint256.toString()
            amount1 = ether('6')
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 }))
                .to.emit(fixedSwapNFT, 'Swapped')
                .withArgs(index, w2.address, 0b0000000101111100, amount1)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(w2.address)
            }
        })

        it('when cancel should be ok', async function () {
            const amount0 = 1
            const amount1 = ether('10')
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(false)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
            }
            await expect(fixedSwapNFT.connect(creator).creatorClaim(index))
                .to.emit(fixedSwapNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 0b0000001111111111, 0, 0)
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(true)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(creator.address)
            }

            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 })).revertedWith(
                'pool not open'
            )
            await time.increase(time.duration.hours(1))
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof, { value: amount1 })).revertedWith(
                'creator claimed or pool canceled'
            )
        })

        it('when swap not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 1
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, hexProof, { value: amount1 })).revertedWith(
                'not whitelisted'
            )
        })
    })

    describe('ERC721/ETH pool without whitelist', function () {
        let tokenIds: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc721Token.address
            const token1 = ZERO_ADDRESS
            tokenIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
            const amountTotal0 = tokenIds.length
            const amountTotal1 = ether('10')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const isERC721 = true
            const maxAmount0PerWallet = ether('100')
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                maxAmount0PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwapNFT], creator, expireAt)
            await erc721Token.connect(creator).setApprovalForAll(fixedSwapNFT.address, true)
            await expect(
                fixedSwapNFT
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
            ).to.emit(fixedSwapNFT, 'Created')
            const pool = await fixedSwapNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            expect((await fixedSwapNFT.getTokenIdsByIndex(0)).length).to.be.equal(tokenIds.length)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(true)
            expect(await fixedSwapNFT.maxAmount0PerWallet(index)).to.be.equal(maxAmount0PerWallet)
            expect(await fixedSwapNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwapNFT.getPoolCount()).to.be.equal(1)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
            }
        })

        it('when swap should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 0b0000001111111111
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 }))
                .to.emit(fixedSwapNFT, 'Swapped')
                .withArgs(index, buyer.address, amount0, amount1)
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(0b0000001111111111)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
            expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(0b0000001111111111)
            expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('10'))
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'swap amount is zero'
            )
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
            }
        })

        it('when cancel should be ok', async function () {
            const amount0 = 1
            const amount1 = ether('10')
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(false)
            expect(await erc721Token.ownerOf(0)).to.equal(fixedSwapNFT.address)
            await fixedSwapNFT.connect(creator).creatorClaim(index)
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(true)
            expect(await erc721Token.ownerOf(0)).to.equal(creator.address)

            await time.increase(time.duration.hours(1))
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'creator claimed or pool canceled'
            )
        })

        it('when swap not open should revert', async function () {
            const amount0 = 1
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'pool not open'
            )
        })

        describe('claim pool', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount0 = 0b0000001111111111
                const amount1 = ether('10')
                await fixedSwapNFT.connect(buyer).swap(index, amount0, [], { from: buyer.address, value: amount1 })
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(0b0000001111111111)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
                expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(0b0000001111111111)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('10'))
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
                }
            })

            it('creatorClaim should work', async function () {
                expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(false)
                await time.increase(time.duration.hours(10))
                await fixedSwapNFT.connect(creator).creatorClaim(index)
                expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(true)
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
                }
            })

            it('creatorClaim during pool running should revert', async function () {
                await expect(fixedSwapNFT.connect(creator).creatorClaim(index)).revertedWith(
                    'cannot claim during pool running'
                )
            })

            it('userClaim should be ok', async function () {
                await time.increase(time.duration.hours(11))
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(fixedSwapNFT.address)
                }
                await fixedSwapNFT.connect(buyer).userClaim(index)
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(buyer.address)
                }
            })

            it('userClaim not ready should revert', async function () {
                await time.increase(time.duration.hours(10))
                await expect(fixedSwapNFT.userClaim(index)).to.revertedWith('claim not ready')
            })
        })

        describe('cancel pool', function () {
            beforeEach(async function () {
                expect(await erc721Token.ownerOf(0)).to.equal(fixedSwapNFT.address)
                await fixedSwapNFT.connect(creator).creatorClaim(index)
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(ether('0'))
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('0'))
                expect(await erc721Token.ownerOf(0)).to.equal(creator.address)
            })

            it('swap should revert', async function () {
                await time.increase(time.duration.hours(1))
                const amount0 = 1
                const amount1 = ether('10')
                await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).to.revertedWith(
                    'creator claimed or pool canceled'
                )
            })
        })

        describe('reverse pool', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount0 = 1
                const amount1 = ether('10')
                await fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(1)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('1'))
                expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(1)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('1'))
                expect(await erc721Token.ownerOf(0)).to.equal(fixedSwapNFT.address)
            })

            it('reverse should work', async function () {
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(1)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('1'))
                const amount0 = await fixedSwapNFT.myAmountSwapped0(buyer.address, index)
                expect(amount0).to.be.equal(1)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('1'))
                await fixedSwapNFT.connect(buyer).reverse(index, amount0)
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(0)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(0)
                expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(0)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(0)
                expect(await erc721Token.ownerOf(0)).to.equal(fixedSwapNFT.address)
            })

            it('reverse when pool close should revert', async function () {
                await time.increase(time.duration.hours(10))
                const amount0 = await fixedSwapNFT.myAmountSwapped0(buyer.address, index)
                await expect(fixedSwapNFT.connect(buyer).reverse(index, amount0)).revertedWith('this pool is closed')
            })
        })

        it('when swap with invalid amount should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 1
            const amount1 = ether('0.1')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'invalid amount of ETH'
            )
        })
    })

    describe('ERC1155/ETH with whitelist', function () {
        let hexProof1: any
        let hexProof2: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc1155Token.address
            const token1 = ZERO_ADDRESS
            const tokenIds = [0]
            const amountTotal0 = 10
            const amountTotal1 = ether('10')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = BigNumber.from('0')
            const isERC721 = false
            const maxAmount0PerWallet = ether('100')

            const leaves = [w1.address, w2.address, w3.address, w4.address].map((addr) =>
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [addr]))
            )
            const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true })
            const root = tree.getRoot().toString('hex')
            hexProof1 = tree.getHexProof(
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w1.address]))
            )
            hexProof2 = tree.getHexProof(
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w2.address]))
            )

            const whitelistRoot = `0x${root}`
            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                maxAmount0PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Instant
            const releaseData: any[] = []
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwapNFT], creator, expireAt)
            await erc1155Token.connect(creator).setApprovalForAll(fixedSwapNFT.address, true)
            await expect(
                fixedSwapNFT
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
            ).to.emit(fixedSwapNFT, 'Created')
            const pool = await fixedSwapNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect(pool.tokenIds[0]).to.be.equal(0)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(false)
            expect(await fixedSwapNFT.maxAmount0PerWallet(index)).to.be.equal(maxAmount0PerWallet)
            expect(await fixedSwapNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwapNFT.getPoolCount()).to.be.equal(1)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, tokenIds[0])).to.equal(10)
        })

        it('when swap in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 10
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof2, { value: amount1 }))
                .to.emit(fixedSwapNFT, 'Swapped')
                .withArgs(index, w2.address, amount0, amount1)
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(10)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof2, { value: amount1 })).revertedWith(
                'swap amount is zero'
            )
            expect(await erc1155Token.balanceOf(w2.address, 0)).to.equal(10)
        })

        it('when partial swap in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 4
            const amount1 = ether('4')

            await fixedSwapNFT.connect(w1).swap(index, amount0, hexProof1, { value: amount1 })
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(4)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('4'))
            expect(await fixedSwapNFT.myAmountSwapped0(w1.address, index)).to.be.equal(4)
            expect(await fixedSwapNFT.myAmountSwapped1(w1.address, index)).to.be.equal(ether('4'))
            expect(await erc1155Token.balanceOf(w1.address, 0)).to.equal(4)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(6)

            await fixedSwapNFT.connect(w2).swap(index, amount0, hexProof2, { value: amount1 })
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(8)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('8'))
            expect(await fixedSwapNFT.myAmountSwapped0(w2.address, index)).to.be.equal(4)
            expect(await fixedSwapNFT.myAmountSwapped1(w2.address, index)).to.be.equal(ether('4'))
            expect(await erc1155Token.balanceOf(w2.address, 0)).to.equal(4)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(2)

            await fixedSwapNFT.connect(w2).swap(index, amount0, hexProof2, { value: amount1 })
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(10)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
            expect(await fixedSwapNFT.myAmountSwapped0(w2.address, index)).to.be.equal(6)
            expect(await fixedSwapNFT.myAmountSwapped1(w2.address, index)).to.be.equal(ether('6'))
            expect(await erc1155Token.balanceOf(w2.address, 0)).to.equal(6)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(0)
        })

        it('when cancel should be ok', async function () {
            const amount0 = 10
            const amount1 = ether('10')
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(false)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
            await fixedSwapNFT.connect(creator).creatorClaim(index)
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(true)
            expect(await erc1155Token.balanceOf(creator.address, 0)).to.equal(10)

            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof2, { value: amount1 })).revertedWith(
                'pool not open'
            )
            await time.increase(time.duration.hours(1))
            await expect(fixedSwapNFT.connect(w2).swap(index, amount0, hexProof2, { value: amount1 })).revertedWith(
                'creator claimed or pool canceled'
            )
        })

        it('when swap not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 1
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, hexProof2, { value: amount1 })).revertedWith(
                'not whitelisted'
            )
        })
    })

    describe('ERC1155/ETH without whitelist', function () {
        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc1155Token.address
            const token1 = ZERO_ADDRESS
            const tokenIds = [0]
            const amountTotal0 = 10
            const amountTotal1 = ether('10')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const isERC721 = false
            const maxAmount0PerWallet = ether('100')
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountTotal1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                maxAmount0PerWallet,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const enableReverse = true
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.FixedSwapNFT], creator, expireAt)
            await erc1155Token.connect(creator).setApprovalForAll(fixedSwapNFT.address, true)
            await expect(
                fixedSwapNFT
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
            ).to.emit(fixedSwapNFT, 'Created')
            const pool = await fixedSwapNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect(pool.tokenIds).to.be.equal(0)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountTotal1).to.be.equal(amountTotal1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(false)
            expect(await fixedSwapNFT.maxAmount0PerWallet(index)).to.be.equal(maxAmount0PerWallet)
            expect(await fixedSwapNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await fixedSwapNFT.getPoolCount()).to.be.equal(1)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, tokenIds[0])).to.equal(10)
        })

        it('when swap should be ok', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 10
            const amount1 = ether('10')
            await fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })
            expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(10)
            expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
            expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(10)
            expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('10'))
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'swap amount is zero'
            )
            expect(await erc1155Token.balanceOf(buyer.address, 0)).to.equal(0)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
        })

        it('when cancel should be ok', async function () {
            const amount0 = 10
            const amount1 = ether('10')
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(false)
            expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
            await fixedSwapNFT.connect(creator).creatorClaim(index)
            expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(true)
            expect(await erc1155Token.balanceOf(creator.address, 0)).to.equal(10)

            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'pool not open'
            )
            await time.increase(time.duration.hours(1))
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'creator claimed or pool canceled'
            )
        })

        it('when swap not open should revert', async function () {
            const amount0 = 1
            const amount1 = ether('10')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'pool not open'
            )
        })

        describe('claim pool', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount0 = 4
                const amount1 = ether('4')
                await fixedSwapNFT.connect(buyer).swap(index, amount0, [], { from: buyer.address, value: amount1 })
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(4)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('4'))
                expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(4)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('4'))
                expect(await erc1155Token.balanceOf(buyer.address, 0)).to.equal(0)
                expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
            })

            it('creatorClaim should work', async function () {
                expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(false)
                expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
                await time.increase(time.duration.hours(10))
                await fixedSwapNFT.connect(creator).creatorClaim(index)
                expect(await fixedSwapNFT.creatorClaimed(index)).to.equal(true)
                expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(4)
                expect(await erc1155Token.balanceOf(creator.address, 0)).to.equal(6)
            })

            it('creatorClaim during pool running should revert', async function () {
                await expect(fixedSwapNFT.connect(creator).creatorClaim(index)).revertedWith(
                    'cannot claim during pool running'
                )
            })

            it('userClaim should be ok', async function () {
                await time.increase(time.duration.hours(11))
                await fixedSwapNFT.connect(buyer).userClaim(index)
                expect(await erc1155Token.balanceOf(buyer.address, 0)).to.equal(4)
                expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(6)
            })

            it('userClaim not ready should revert', async function () {
                await time.increase(time.duration.hours(10))
                await expect(fixedSwapNFT.userClaim(index)).revertedWith('claim not ready')
            })
        })

        describe('cancel pool', function () {
            beforeEach(async function () {
                await fixedSwapNFT.connect(creator).creatorClaim(index)
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(ether('0'))
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('0'))
                expect(await erc1155Token.balanceOf(creator.address, 0)).to.equal(10)
            })

            it('swap should revert', async function () {
                await time.increase(time.duration.hours(1))
                const amount0 = 10
                const amount1 = ether('10')
                await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).to.revertedWith(
                    'creator claimed or pool canceled'
                )
            })
        })

        describe('reverse pool', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount0 = 10
                const amount1 = ether('10')
                await fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(10)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(ether('10'))
                expect(await fixedSwapNFT.myAmountSwapped0(buyer.address, index)).to.be.equal(10)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('10'))
                expect(await erc1155Token.balanceOf(buyer.address, 0)).to.equal(0)
                expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
            })

            it('reverse should work', async function () {
                const amount0 = await fixedSwapNFT.myAmountSwapped0(buyer.address, index)
                expect(amount0).to.be.equal(10)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(ether('10'))
                // await erc721Token.connect(buyer).setApprovalForAll(fixedSwapNFT.address, true)
                await fixedSwapNFT.connect(buyer).reverse(index, amount0)
                expect(await fixedSwapNFT.amountSwap0(index)).to.be.equal(0)
                expect(await fixedSwapNFT.amountSwap1(index)).to.be.equal(0)
                expect(await fixedSwapNFT.myAmountSwapped1(buyer.address, index)).to.be.equal(0)
                expect(await erc1155Token.balanceOf(fixedSwapNFT.address, 0)).to.equal(10)
            })

            it('reverse when pool close should revert', async function () {
                await time.increase(time.duration.hours(10))
                const amount0 = await fixedSwapNFT.myAmountSwapped0(buyer.address, index)
                await expect(fixedSwapNFT.connect(buyer).reverse(index, amount0)).revertedWith('this pool is closed')
            })
        })

        it('when swap with invalid amount should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount0 = 10
            const amount1 = ether('9')
            await expect(fixedSwapNFT.connect(buyer).swap(index, amount0, [], { value: amount1 })).revertedWith(
                'invalid amount of ETH'
            )
        })
    })
})
