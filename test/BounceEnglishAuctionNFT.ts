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

describe('BounceEnglishAuctionNFT', function () {
    let englishAuctionNFT: Contract
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
        const BounceEnglishAuctionNFT = await ethers.getContractFactory('BounceEnglishAuctionNFT')
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

        // Deploy BounceEnglishAuctionNFT contract for each test
        englishAuctionNFT = await BounceEnglishAuctionNFT.deploy()
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
        await englishAuctionNFT.initialize(txFeeRatio, bounceStake.address, signer.address)

        await expect(englishAuctionNFT.initialize(txFeeRatio, bounceStake.address, signer.address)).revertedWith(
            'Initializable: contract is already initialized'
        )
        expect(await englishAuctionNFT.owner()).to.be.equal(owner.address)
        expect(await englishAuctionNFT.txFeeRatio()).to.be.equal(ether('0.025'))
        expect(await englishAuctionNFT.stakeContract()).to.equal(bounceStake.address)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(englishAuctionNFT.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(buyer.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(englishAuctionNFT.address, usd('10000'))
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
        await englishAuctionNFT.transferOwnership(newOwner.address)
        expect(await englishAuctionNFT.owner()).to.equal(newOwner.address)
    })

    it('transferOwnership by attacker should be ok', async function () {
        await expect(englishAuctionNFT.connect(attacker).transferOwnership(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setTxFeeRatio should be ok', async function () {
        await englishAuctionNFT.setTxFeeRatio(ether('0.2'))
        expect(await englishAuctionNFT.txFeeRatio()).to.equal(ether('0.2'))
    })

    it('setTxFeeRatio by attacker should be ok', async function () {
        await expect(englishAuctionNFT.connect(attacker).setTxFeeRatio(ether('0.2'))).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setStakeContract should be ok', async function () {
        await englishAuctionNFT.setStakeContract(newOwner.address)
        expect(await englishAuctionNFT.stakeContract()).to.equal(newOwner.address)
    })

    it('setStakeContract by attacker should be ok', async function () {
        await expect(englishAuctionNFT.connect(attacker).setStakeContract(newOwner.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setSigner should be ok', async function () {
        await englishAuctionNFT.setSigner(newSigner.address)
    })

    it('setSigner by attacker should be ok', async function () {
        await expect(englishAuctionNFT.connect(attacker).setSigner(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    describe('ERC721/ETH pool with whitelist', function () {
        let hexProof1: any
        let hexProof2: any
        let hexProof3: any
        let hexProof4: any
        let tokenIds: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc721Token.address
            const token1 = ZERO_ADDRESS
            tokenIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
            const amountTotal0 = tokenIds.length
            const amountMin1 = ether('1')
            const amountMinIncr1 = ether('0.1')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt
            const isERC721 = true

            const leaves = [w1.address, w2.address, w3.address, w4.address].map((addr) =>
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [addr]))
            )
            const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true })
            const root = tree.getRoot().toString('hex')
            const leaf1 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w1.address]))
            const leaf2 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w2.address]))
            const leaf3 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w3.address]))
            const leaf4 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w4.address]))
            hexProof1 = tree.getHexProof(leaf1)
            hexProof2 = tree.getHexProof(leaf2)
            hexProof3 = tree.getHexProof(leaf3)
            hexProof4 = tree.getHexProof(leaf4)

            const whitelistRoot = `0x${root}`
            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountMin1,
                amountMinIncr1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.EnglishAuctionNFT], creator, expireAt)
            await erc721Token.connect(creator).setApprovalForAll(englishAuctionNFT.address, true)
            await expect(
                englishAuctionNFT
                    .connect(creator)
                    .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            ).to.emit(englishAuctionNFT, 'Created')
            const pool = await englishAuctionNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect((await englishAuctionNFT.getTokenIdsByIndex(0)).length).to.be.equal(tokenIds.length)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.amountMinIncr1).to.be.equal(amountMinIncr1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(true)
            expect(await englishAuctionNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await englishAuctionNFT.getPoolCount()).to.be.equal(1)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(englishAuctionNFT.address)
            }
        })

        it('when bid in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))

            const amount1_1 = ether('1')
            const tx1 = await englishAuctionNFT
                .connect(w1)
                .bid(index, amount1_1, hexProof1, { value: amount1_1, gasPrice: 1e9 })
            await expect(tx1).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w1.address, amount1_1)
            expect((await tx1.wait()).gasUsed).to.equal(148514)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(148456000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.1'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w1.address)

            const amount1_2 = ether('1.1')
            const tx2 = await englishAuctionNFT
                .connect(w2)
                .bid(index, amount1_2, hexProof2, { value: amount1_2.add(148514000000000n), gasPrice: 1e9 })
            await expect(tx2).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w2.address, amount1_2)
            expect((await tx2.wait()).gasUsed).to.equal(112670)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(112670000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.2'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w2.address)

            const amount1_3 = ether('1.2')
            const tx3 = await englishAuctionNFT
                .connect(w3)
                .bid(index, amount1_3, hexProof3, { value: amount1_3.add(112670000000000n), gasPrice: 1e9 })
            await expect(tx3).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w3.address, amount1_3)
            expect((await tx3.wait()).gasUsed).to.equal(109858)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(112670000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.3'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w3.address)

            const amount1_4 = ether('1.3')
            const tx4 = await englishAuctionNFT
                .connect(w4)
                .bid(index, amount1_4, hexProof4, { value: amount1_4.add(112670000000000n), gasPrice: 1e9 })
            await expect(tx4).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w4.address, amount1_4)
            expect((await tx4.wait()).gasUsed).to.equal(112634)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(112646000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.4'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w4.address)

            await time.increase(time.duration.hours(11))
            await expect(englishAuctionNFT.connect(w1).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w2).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w3).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w4).bidderClaim(index))
                .to.emit(englishAuctionNFT, 'BidderClaimed')
                .withArgs(index, w4.address, tokenIds.length)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(w4.address)
            }

            await expect(englishAuctionNFT.connect(creator).creatorClaim(index))
                .to.emit(englishAuctionNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 0, ether('1.3'))
        })

        it('when bid not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('1')
            await expect(
                englishAuctionNFT.connect(buyer).bid(index, amount1, hexProof1, { value: amount1 })
            ).revertedWith('not whitelisted')
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
            const amountMin1 = ether('1')
            const amountMinIncr1 = ether('0.1')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const isERC721 = true
            const whitelistRoot = ethers.constants.HashZero

            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountMin1,
                amountMinIncr1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.EnglishAuctionNFT], creator, expireAt)
            await erc721Token.connect(creator).setApprovalForAll(englishAuctionNFT.address, true)
            await expect(
                englishAuctionNFT
                    .connect(creator)
                    .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            ).to.emit(englishAuctionNFT, 'Created')
            const pool = await englishAuctionNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect((await englishAuctionNFT.getTokenIdsByIndex(0)).length).to.be.equal(tokenIds.length)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.amountMinIncr1).to.be.equal(amountMinIncr1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(true)
            expect(await englishAuctionNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await englishAuctionNFT.getPoolCount()).to.be.equal(1)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(englishAuctionNFT.address)
            }
        })

        it('when bid should be ok', async function () {
            await time.increase(time.duration.hours(1))

            const amount1_1 = ether('1')
            const tx1 = await englishAuctionNFT
                .connect(w1)
                .bid(index, amount1_1, [], { value: amount1_1, gasPrice: 1e9 })
            await expect(tx1).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w1.address, amount1_1)
            expect((await tx1.wait()).gasUsed).to.equal(146364)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(147494000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.1'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w1.address)

            const amount1_2 = ether('1.1')
            const tx2 = await englishAuctionNFT
                .connect(w2)
                .bid(index, amount1_2, [], { value: amount1_2.add(145097000000000n), gasPrice: 1e9 })
            await expect(tx2).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w2.address, amount1_2)
            expect((await tx2.wait()).gasUsed).to.equal(110401)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(111589000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.2'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w2.address)

            const amount1_3 = ether('1.2')
            const tx3 = await englishAuctionNFT
                .connect(w3)
                .bid(index, amount1_3, [], { value: amount1_3.add(111589000000000n), gasPrice: 1e9 })
            await expect(tx3).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w3.address, amount1_3)
            expect((await tx3.wait()).gasUsed).to.equal(107601)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(111589000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.3'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w3.address)

            const amount1_4 = ether('1.3')
            const tx4 = await englishAuctionNFT
                .connect(w4)
                .bid(index, amount1_4, [], { value: amount1_4.add(111589000000000n), gasPrice: 1e9 })
            await expect(tx4).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w4.address, amount1_4)
            expect((await tx4.wait()).gasUsed).to.equal(107601)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(111589000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.4'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w4.address)

            await time.increase(time.duration.hours(11))
            await expect(englishAuctionNFT.connect(w1).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w2).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w3).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w4).bidderClaim(index))
                .to.emit(englishAuctionNFT, 'BidderClaimed')
                .withArgs(index, w4.address, tokenIds.length)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(w4.address)
            }

            await expect(englishAuctionNFT.connect(creator).creatorClaim(index))
                .to.emit(englishAuctionNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 0, ether('1.3'))
        })

        it('when bid not open should revert', async function () {
            const amount1 = ether('10')
            await expect(englishAuctionNFT.connect(buyer).bid(index, amount1, [], { value: amount1 })).revertedWith(
                'pool not open'
            )
        })

        describe('claim pool', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = ether('10')
                await englishAuctionNFT.connect(buyer).bid(index, amount1, [], { from: buyer.address, value: amount1 })
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(englishAuctionNFT.address)
                }
            })

            it('creatorClaim should work', async function () {
                expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(false)
                await time.increase(time.duration.hours(10))
                await englishAuctionNFT.connect(creator).creatorClaim(index)
                expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(true)
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(englishAuctionNFT.address)
                }
            })

            it('creatorClaim during pool running should revert', async function () {
                await expect(englishAuctionNFT.connect(creator).creatorClaim(index)).revertedWith(
                    'cannot claim during pool running'
                )
            })

            it('bidderClaim should be ok', async function () {
                await time.increase(time.duration.hours(11))
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(englishAuctionNFT.address)
                }
                await englishAuctionNFT.connect(buyer).bidderClaim(index)
                for (let i = 0; i < tokenIds.length; i++) {
                    expect(await erc721Token.ownerOf(i)).to.equal(buyer.address)
                }
            })

            it('bidderClaim not ready should revert', async function () {
                await time.increase(time.duration.hours(10))
                await expect(englishAuctionNFT.bidderClaim(index)).to.revertedWith('claim not ready')
            })
        })

        it('cancel pool should be ok', async function () {
            expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(false)
            await englishAuctionNFT.connect(creator).creatorClaim(index)
            expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(true)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(creator.address)
            }

            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await expect(
                englishAuctionNFT.connect(buyer).bid(index, amount1, [], { from: buyer.address, value: amount1 })
            ).to.revertedWith('creator claimed or pool canceled')
        })
    })

    describe('ERC1155/ETH with whitelist', function () {
        let hexProof1: any
        let hexProof2: any
        let hexProof3: any
        let hexProof4: any
        let tokenIds: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc1155Token.address
            const token1 = ZERO_ADDRESS
            tokenIds = [0]
            const amountTotal0 = 10
            const amountMin1 = ether('1')
            const amountMinIncr1 = ether('0.1')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt
            const isERC721 = false

            const leaves = [w1.address, w2.address, w3.address, w4.address].map((addr) =>
                ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [addr]))
            )
            const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true })
            const root = tree.getRoot().toString('hex')
            const leaf1 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w1.address]))
            const leaf2 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w2.address]))
            const leaf3 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w3.address]))
            const leaf4 = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [w4.address]))
            hexProof1 = tree.getHexProof(leaf1)
            hexProof2 = tree.getHexProof(leaf2)
            hexProof3 = tree.getHexProof(leaf3)
            hexProof4 = tree.getHexProof(leaf4)

            const whitelistRoot = `0x${root}`
            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountMin1,
                amountMinIncr1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.EnglishAuctionNFT], creator, expireAt)
            await erc1155Token.connect(creator).setApprovalForAll(englishAuctionNFT.address, true)
            await expect(
                englishAuctionNFT
                    .connect(creator)
                    .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            ).to.emit(englishAuctionNFT, 'Created')
            const pool = await englishAuctionNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect(pool.tokenIds[0]).to.be.equal(0)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.amountMinIncr1).to.be.equal(amountMinIncr1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(false)
            expect(await englishAuctionNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await englishAuctionNFT.getPoolCount()).to.be.equal(1)
            expect(await erc1155Token.balanceOf(englishAuctionNFT.address, tokenIds[0])).to.equal(10)
        })

        it('when bid in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))

            const amount1_1 = ether('1')
            const tx1 = await englishAuctionNFT
                .connect(w1)
                .bid(index, amount1_1, hexProof1, { value: amount1_1, gasPrice: 1e9 })
            await expect(tx1).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w1.address, amount1_1)
            expect((await tx1.wait()).gasUsed).to.equal(127757)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(127699000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.1'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w1.address)

            const amount1_2 = ether('1.1')
            const tx2 = await englishAuctionNFT
                .connect(w2)
                .bid(index, amount1_2, hexProof2, { value: amount1_2.add(127699000000000n), gasPrice: 1e9 })
            await expect(tx2).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w2.address, amount1_2)
            expect((await tx2.wait()).gasUsed).to.equal(94250)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(94192000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.2'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w2.address)

            const amount1_4 = ether('1.3')
            const tx4 = await englishAuctionNFT
                .connect(w4)
                .bid(index, amount1_4, hexProof4, { value: amount1_4.add(94192000000000n), gasPrice: 1e9 })
            await expect(tx4).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w4.address, amount1_4)
            expect((await tx4.wait()).gasUsed).to.equal(94239)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(94193000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.4'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w4.address)

            await time.increase(time.duration.hours(11))
            await expect(englishAuctionNFT.connect(w1).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w2).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w3).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w4).bidderClaim(index))
                .to.emit(englishAuctionNFT, 'BidderClaimed')
                .withArgs(index, w4.address, 10)
            expect(await erc1155Token.balanceOf(w4.address, tokenIds[0])).to.equal(10)

            await expect(englishAuctionNFT.connect(creator).creatorClaim(index))
                .to.emit(englishAuctionNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 0, ether('1.3'))
        })
    })

    describe('ERC1155/ETH without whitelist', function () {
        let tokenIds: any

        beforeEach(async function () {
            const name = 'Auction'
            const token0 = erc1155Token.address
            const token1 = ZERO_ADDRESS
            tokenIds = [0]
            const amountTotal0 = 10
            const amountMin1 = ether('1')
            const amountMinIncr1 = ether('0.1')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeAt = openAt.add(time.duration.hours(10))
            const claimAt = closeAt.add(time.duration.hours(1))
            const isERC721 = false
            const whitelistRoot = ethers.constants.HashZero
            const createReq = [
                name,
                token0,
                token1,
                tokenIds,
                amountTotal0,
                amountMin1,
                amountMinIncr1,
                openAt,
                closeAt,
                claimAt,
                isERC721,
                whitelistRoot,
            ]
            const id = 0
            const releaseType = ReleaseType.Cliff
            const releaseData: any[] = [[claimAt, 0]]
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.EnglishAuctionNFT], creator, expireAt)
            await erc1155Token.connect(creator).setApprovalForAll(englishAuctionNFT.address, true)
            await expect(
                englishAuctionNFT
                    .connect(creator)
                    .createV2(id, createReq, releaseType, releaseData, enableAuctionHolder, expireAt, signature)
            ).to.emit(englishAuctionNFT, 'Created')
            const pool = await englishAuctionNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect(pool.tokenIds).to.be.equal(0)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.amountMinIncr1).to.be.equal(amountMinIncr1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeAt).to.be.equal(closeAt)
            expect(pool.claimAt).to.be.equal(claimAt)
            expect(pool.isERC721).to.be.equal(false)
            expect(await englishAuctionNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await englishAuctionNFT.getPoolCount()).to.be.equal(1)
            expect(await erc1155Token.balanceOf(englishAuctionNFT.address, tokenIds[0])).to.equal(10)
        })

        it('when bid should be ok', async function () {
            await time.increase(time.duration.hours(1))

            const amount1_1 = ether('1')
            const tx1 = await englishAuctionNFT
                .connect(w1)
                .bid(index, amount1_1, [], { value: amount1_1, gasPrice: 1e9 })
            await expect(tx1).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w1.address, amount1_1)
            expect((await tx1.wait()).gasUsed).to.equal(125607)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(126737000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.1'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w1.address)

            const amount1_2 = ether('1.1')
            const tx2 = await englishAuctionNFT
                .connect(w2)
                .bid(index, amount1_2, [], { value: amount1_2.add(126737000000000n), gasPrice: 1e9 })
            await expect(tx2).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w2.address, amount1_2)
            expect((await tx2.wait()).gasUsed).to.equal(92099)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(93229000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.2'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w2.address)

            const amount1_3 = ether('1.2')
            const tx3 = await englishAuctionNFT
                .connect(w3)
                .bid(index, amount1_3, [], { value: amount1_3.add(93229000000000n), gasPrice: 1e9 })
            await expect(tx3).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w3.address, amount1_3)
            expect((await tx3.wait()).gasUsed).to.equal(89299)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(93229000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.3'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w3.address)

            const amount1_4 = ether('1.3')
            const tx4 = await englishAuctionNFT
                .connect(w4)
                .bid(index, amount1_4, [], { value: amount1_4.add(90833000000000n), gasPrice: 1e9 })
            await expect(tx4).to.emit(englishAuctionNFT, 'Bid').withArgs(index, w4.address, amount1_4)
            expect((await tx4.wait()).gasUsed).to.equal(86845)
            expect(await englishAuctionNFT.gasFee(index)).to.equal(90833000000000n)
            expect(await englishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.4'))
            expect(await englishAuctionNFT.currentBidder(index)).to.equal(w4.address)

            await time.increase(time.duration.hours(11))
            await expect(englishAuctionNFT.connect(w1).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w2).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w3).bidderClaim(index)).revertedWith('not winner')
            await expect(englishAuctionNFT.connect(w4).bidderClaim(index))
                .to.emit(englishAuctionNFT, 'BidderClaimed')
                .withArgs(index, w4.address, 10)
            expect(await erc1155Token.balanceOf(w4.address, tokenIds[0])).to.equal(10)

            await expect(englishAuctionNFT.connect(creator).creatorClaim(index))
                .to.emit(englishAuctionNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 0, ether('1.3'))
        })

        it('when bid not open should revert', async function () {
            const amount1 = ether('10')
            await expect(englishAuctionNFT.connect(buyer).bid(index, amount1, [], { value: amount1 })).revertedWith(
                'pool not open'
            )
        })

        describe('claim pool', function () {
            beforeEach(async function () {
                await time.increase(time.duration.hours(1))
                const amount1 = ether('10')
                await englishAuctionNFT.connect(buyer).bid(index, amount1, [], { from: buyer.address, value: amount1 })
                expect(await erc1155Token.balanceOf(englishAuctionNFT.address, tokenIds[0])).to.equal(10)
            })

            it('creatorClaim should work', async function () {
                expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(false)
                await time.increase(time.duration.hours(10))
                await englishAuctionNFT.connect(creator).creatorClaim(index)
                expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(true)
                expect(await erc1155Token.balanceOf(englishAuctionNFT.address, tokenIds[0])).to.equal(10)
            })

            it('creatorClaim during pool running should revert', async function () {
                await expect(englishAuctionNFT.connect(creator).creatorClaim(index)).revertedWith(
                    'cannot claim during pool running'
                )
            })

            it('bidderClaim should be ok', async function () {
                await time.increase(time.duration.hours(11))
                expect(await erc1155Token.balanceOf(englishAuctionNFT.address, tokenIds[0])).to.equal(10)
                await englishAuctionNFT.connect(buyer).bidderClaim(index)
                expect(await erc1155Token.balanceOf(buyer.address, tokenIds[0])).to.equal(10)
            })

            it('bidderClaim not ready should revert', async function () {
                await time.increase(time.duration.hours(10))
                await expect(englishAuctionNFT.bidderClaim(index)).to.revertedWith('claim not ready')
            })
        })

        it('cancel pool should be ok', async function () {
            expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(false)
            await englishAuctionNFT.connect(creator).creatorClaim(index)
            expect(await englishAuctionNFT.creatorClaimed(index)).to.equal(true)
            expect(await erc1155Token.balanceOf(creator.address, tokenIds[0])).to.equal(10)

            await time.increase(time.duration.hours(1))
            const amount1 = ether('10')
            await expect(
                englishAuctionNFT.connect(buyer).bid(index, amount1, [], { from: buyer.address, value: amount1 })
            ).to.revertedWith('creator claimed or pool canceled')
        })
    })
})
