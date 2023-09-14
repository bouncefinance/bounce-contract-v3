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

describe('BounceMutantEnglishAuctionNFT', function () {
    let mutantEnglishAuctionNFT: Contract
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
    let d1: SignerWithAddress
    let d2: SignerWithAddress
    let d3: SignerWithAddress
    let d4: SignerWithAddress
    let signer: SignerWithAddress
    let newSigner: SignerWithAddress
    let attacker: SignerWithAddress
    const ZERO_ADDRESS = ethers.constants.AddressZero
    const index = 0

    beforeEach(async function () {
        ;[owner, newOwner, creator, buyer, w1, w2, w3, w4, d1, d2, d3, d4, signer, newSigner, attacker] =
            await ethers.getSigners()

        // Load compiled artifacts
        const BounceMutantEnglishAuctionNFT = await ethers.getContractFactory('BounceMutantEnglishAuctionNFT')
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

        // Deploy BounceMutantEnglishAuctionNFT contract for each test
        mutantEnglishAuctionNFT = await BounceMutantEnglishAuctionNFT.deploy()
        // Deploy Bounce Stake contract for each test
        bounceStake = await BounceStake.deploy()
        // Deploy a ERC20 contract for each test
        erc20Token = await ERC20.deploy('Auction Token', 'AUCTION')
        usdToken = await USDT.deploy(usd('500000'), 'USD Token', 'USDT', 6)
        // Deploy a NFT contract for each test
        erc721Token = await ERC721.deploy('ERC721 Token', '721', '')
        erc1155Token = await ERC1155.deploy('ERC1155 Token')

        const txFeeRatio = ether('0.006')
        // initialize Bounce contract
        await mutantEnglishAuctionNFT.initialize(txFeeRatio, bounceStake.address, signer.address)

        await expect(mutantEnglishAuctionNFT.initialize(txFeeRatio, bounceStake.address, signer.address)).revertedWith(
            'Initializable: contract is already initialized'
        )
        expect(await mutantEnglishAuctionNFT.owner()).to.be.equal(owner.address)
        expect(await mutantEnglishAuctionNFT.txFeeRatio()).to.be.equal(ether('0.006'))
        expect(await mutantEnglishAuctionNFT.stakeContract()).to.equal(bounceStake.address)

        // mint ERC20 token
        await erc20Token.mint(owner.address, ether('10000'))
        await erc20Token.mint(mutantEnglishAuctionNFT.address, ether('10000'))
        await erc20Token.mint(creator.address, ether('10000'))
        await erc20Token.mint(buyer.address, ether('10000'))
        await erc20Token.mint(w1.address, ether('10000'))
        await erc20Token.mint(w2.address, ether('10000'))

        // mint USD token
        await usdToken.transfer(owner.address, usd('10000'))
        await usdToken.transfer(mutantEnglishAuctionNFT.address, usd('10000'))
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
        await mutantEnglishAuctionNFT.transferOwnership(newOwner.address)
        expect(await mutantEnglishAuctionNFT.owner()).to.equal(newOwner.address)
    })

    it('transferOwnership by attacker should be ok', async function () {
        await expect(mutantEnglishAuctionNFT.connect(attacker).transferOwnership(attacker.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setTxFeeRatio should be ok', async function () {
        await mutantEnglishAuctionNFT.setTxFeeRatio(ether('0.2'))
        expect(await mutantEnglishAuctionNFT.txFeeRatio()).to.equal(ether('0.2'))
    })

    it('setTxFeeRatio by attacker should be ok', async function () {
        await expect(mutantEnglishAuctionNFT.connect(attacker).setTxFeeRatio(ether('0.2'))).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setStakeContract should be ok', async function () {
        await mutantEnglishAuctionNFT.setStakeContract(newOwner.address)
        expect(await mutantEnglishAuctionNFT.stakeContract()).to.equal(newOwner.address)
    })

    it('setStakeContract by attacker should be ok', async function () {
        await expect(mutantEnglishAuctionNFT.connect(attacker).setStakeContract(newOwner.address)).revertedWith(
            'Ownable: caller is not the owner'
        )
    })

    it('setSigner should be ok', async function () {
        await mutantEnglishAuctionNFT.setSigner(newSigner.address)
    })

    it('setSigner by attacker should be ok', async function () {
        await expect(mutantEnglishAuctionNFT.connect(attacker).setSigner(attacker.address)).revertedWith(
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
            const amountMinIncrRatio1 = ether('0.3')
            const now = await time.latest()
            const openAt = BigNumber.from(now).add(time.duration.hours(1))
            const closeIncrInterval = time.duration.hours(1)
            const claimDelay = time.duration.hours(1)
            const isERC721 = true

            const distributeRatio = [ether('0.1'), ether('0.3')]
            const distributes = [
                [d1.address, ether('0.1')],
                [d2.address, ether('0.1')],
                [d3.address, ether('0.2')],
                [d4.address, ether('0.2')],
            ]

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
                amountMinIncrRatio1,
                openAt,
                closeIncrInterval,
                claimDelay,
                isERC721,
                whitelistRoot,
            ]
            const id = 0
            const enableAuctionHolder = false
            const expireAt = BigNumber.from(now).add(time.duration.minutes(10))
            const signature = await sign(signer, types, [id, PoolType.MutantEnglishAuctionNFT], creator, expireAt)
            await erc721Token.connect(creator).setApprovalForAll(mutantEnglishAuctionNFT.address, true)
            await expect(
                mutantEnglishAuctionNFT
                    .connect(creator)
                    .createV2(id, createReq, distributeRatio, distributes, enableAuctionHolder, expireAt, signature)
            )
                .to.emit(mutantEnglishAuctionNFT, 'Created')
                .to.emit(mutantEnglishAuctionNFT, 'DistributesSet')
            const pool = await mutantEnglishAuctionNFT.pools(index)
            expect(pool.creator).to.equal(creator.address)
            expect(pool.token0).to.equal(token0)
            expect(pool.token1).to.equal(token1)
            // expect((await mutantEnglishAuctionNFT.getTokenIdsByIndex(0)).length).to.be.equal(tokenIds.length)
            expect(pool.amountTotal0).to.be.equal(10)
            expect(pool.amountMin1).to.be.equal(amountMin1)
            expect(pool.amountMinIncrRatio1).to.be.equal(amountMinIncrRatio1)
            expect(pool.openAt).to.be.equal(openAt)
            expect(pool.closeIncrInterval).to.be.equal(closeIncrInterval)
            expect(pool.closeAt).to.be.equal(openAt.add(closeIncrInterval))
            expect(pool.claimDelay).to.be.equal(claimDelay)
            expect(pool.isERC721).to.be.equal(true)
            expect(await mutantEnglishAuctionNFT.whitelistRootP(index)).to.be.equal(whitelistRoot)
            expect(await mutantEnglishAuctionNFT.getPoolCount()).to.be.equal(1)
            let dr = await mutantEnglishAuctionNFT.distributeRatios(index)
            expect(dr.prevBidderRatio).to.be.equal(distributeRatio[0])
            expect(dr.lastBidderRatio).to.be.equal(distributeRatio[1])
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(mutantEnglishAuctionNFT.address)
            }
            expect(await mutantEnglishAuctionNFT.getOtherDistributeCount(index)).to.be.equal(4)
            for (let i = 0; i < distributes.length; i++) {
                const otherDistribute = await mutantEnglishAuctionNFT.otherDistributes(index, i)
                expect(otherDistribute.target).to.be.equal(distributes[i][0])
                expect(otherDistribute.ratio).to.be.equal(distributes[i][1])
            }
        })

        it('when bid in whitelist should be ok', async function () {
            await time.increase(time.duration.hours(1))

            const amount1_1 = ether('1')
            const tx1 = await mutantEnglishAuctionNFT
                .connect(w1)
                .bid(index, amount1_1, hexProof1, { value: amount1_1, gasPrice: 1e9 })
            await expect(tx1).to.emit(mutantEnglishAuctionNFT, 'Bid').withArgs(index, w1.address, amount1_1, 0, 0)
            let gasFee = await mutantEnglishAuctionNFT.gasFee(index)
            // expect(gasFee).to.equal(124214000000000n)
            expect(await mutantEnglishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.3'))
            expect(await mutantEnglishAuctionNFT.currentBidder(index)).to.equal(w1.address)
            expect(await mutantEnglishAuctionNFT.txFee(index)).to.equal(ether('0.006'))
            expect(await mutantEnglishAuctionNFT.extraAmount1(index)).to.equal(ether('0'))

            const amount1_2 = ether('1.3')
            const tx2 = await mutantEnglishAuctionNFT
                .connect(w2)
                .bid(index, amount1_2, hexProof2, { value: amount1_2.add(gasFee), gasPrice: 1e9 })
            await expect(tx2)
                .to.emit(mutantEnglishAuctionNFT, 'Bid')
                .withArgs(index, w2.address, amount1_2, ether('0.02922'), gasFee)
            gasFee = await mutantEnglishAuctionNFT.gasFee(index)
            // expect(await mutantEnglishAuctionNFT.gasFee(index)).to.equal(137555000000000n)
            expect(await mutantEnglishAuctionNFT.currentBidderAmount(index)).to.equal(ether('1.69'))
            expect(await mutantEnglishAuctionNFT.currentBidder(index)).to.equal(w2.address)
            expect(await mutantEnglishAuctionNFT.txFee(index)).to.equal(ether('0.0138'))
            expect(await mutantEnglishAuctionNFT.extraAmount1(index)).to.equal(ether('0.2922'))

            const amount1_3 = ether('1.69')
            const tx3 = await mutantEnglishAuctionNFT
                .connect(w3)
                .bid(index, amount1_3, hexProof3, { value: amount1_3.add(gasFee), gasPrice: 1e9 })
            await expect(tx3)
                .to.emit(mutantEnglishAuctionNFT, 'Bid')
                .withArgs(index, w3.address, amount1_3, ether('0.037986'), gasFee)
            gasFee = await mutantEnglishAuctionNFT.gasFee(index)
            // expect(await mutantEnglishAuctionNFT.gasFee(index)).to.equal(103355000000000n)
            expect(await mutantEnglishAuctionNFT.currentBidderAmount(index)).to.equal(ether('2.197'))
            expect(await mutantEnglishAuctionNFT.currentBidder(index)).to.equal(w3.address)
            expect(await mutantEnglishAuctionNFT.txFee(index)).to.equal(ether('0.02394'))
            expect(await mutantEnglishAuctionNFT.extraAmount1(index)).to.equal(ether('0.67206'))

            const amount1_4 = ether('2.197')
            const tx4 = await mutantEnglishAuctionNFT
                .connect(w4)
                .bid(index, amount1_4, hexProof4, { value: amount1_4.add(gasFee), gasPrice: 1e9 })
            await expect(tx4)
                .to.emit(mutantEnglishAuctionNFT, 'Bid')
                .withArgs(index, w4.address, amount1_4, ether('0.0493818'), gasFee)
            gasFee = await mutantEnglishAuctionNFT.gasFee(index)
            // expect(await mutantEnglishAuctionNFT.gasFee(index)).to.equal(103356000000000n)
            expect(await mutantEnglishAuctionNFT.currentBidderAmount(index)).to.equal(ether('2.8561'))
            expect(await mutantEnglishAuctionNFT.currentBidder(index)).to.equal(w4.address)
            expect(await mutantEnglishAuctionNFT.txFee(index)).to.equal(ether('0.037122'))
            expect(await mutantEnglishAuctionNFT.extraAmount1(index)).to.equal(ether('1.165878'))

            await time.increase(time.duration.hours(11))
            await expect(mutantEnglishAuctionNFT.connect(w1).bidderClaim(index)).revertedWith('not winner')
            await expect(mutantEnglishAuctionNFT.connect(w2).bidderClaim(index)).revertedWith('not winner')
            await expect(mutantEnglishAuctionNFT.connect(w3).bidderClaim(index)).revertedWith('not winner')
            await expect(mutantEnglishAuctionNFT.connect(w4).bidderClaim(index))
                .to.emit(mutantEnglishAuctionNFT, 'BidderClaimed')
                .withArgs(index, w4.address, tokenIds.length, ether('0.3497634'))
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(w4.address)
            }
            expect(await ethers.provider.getBalance(d1.address)).to.equal(ether('10000'))
            expect(await ethers.provider.getBalance(d2.address)).to.equal(ether('10000'))
            expect(await ethers.provider.getBalance(d3.address)).to.equal(ether('10000'))
            expect(await ethers.provider.getBalance(d4.address)).to.equal(ether('10000'))

            await expect(mutantEnglishAuctionNFT.connect(creator).creatorClaim(index))
                .to.emit(mutantEnglishAuctionNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 0, ether('0.994'))

            expect(await ethers.provider.getBalance(d1.address)).to.equal(ether('10000').add(ether('0.1165878')))
            expect(await ethers.provider.getBalance(d2.address)).to.equal(ether('10000').add(ether('0.1165878')))
            expect(await ethers.provider.getBalance(d3.address)).to.equal(ether('10000').add(ether('0.2331756')))
            expect(await ethers.provider.getBalance(d4.address)).to.equal(ether('10000').add(ether('0.2331756')))
        })

        it('when cancel should be ok', async function () {
            const amount1 = ether('10')
            expect(await mutantEnglishAuctionNFT.creatorClaimed(index)).to.equal(false)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(mutantEnglishAuctionNFT.address)
            }
            await expect(mutantEnglishAuctionNFT.connect(creator).creatorClaim(index))
                .to.emit(mutantEnglishAuctionNFT, 'CreatorClaimed')
                .withArgs(index, creator.address, 10, 0)
            expect(await mutantEnglishAuctionNFT.creatorClaimed(index)).to.equal(true)
            for (let i = 0; i < tokenIds.length; i++) {
                expect(await erc721Token.ownerOf(i)).to.equal(creator.address)
            }

            await expect(
                mutantEnglishAuctionNFT.connect(w2).bid(index, amount1, hexProof2, { value: amount1 })
            ).revertedWith('pool not open')
            await time.increase(time.duration.hours(1))
            const amount1_2 = await mutantEnglishAuctionNFT.currentBidderAmount(index)
            await expect(
                mutantEnglishAuctionNFT.connect(w2).bid(index, amount1_2, hexProof2, { value: amount1_2 })
            ).revertedWith('creator claimed or pool canceled')
        })

        it('when bid not in whitelist should revert', async function () {
            await time.increase(time.duration.hours(1))
            const amount1 = ether('1')
            await expect(
                mutantEnglishAuctionNFT.connect(buyer).bid(index, amount1, hexProof1, { value: amount1 })
            ).revertedWith('not whitelisted')
        })
    })
})
