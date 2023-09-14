import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import ERC20PresetFixedSupply from '../node_modules/@openzeppelin/contracts/build/contracts/ERC20PresetFixedSupply.json'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

describe('BounceStake', () => {
    let owner: SignerWithAddress
    let staker1: SignerWithAddress
    let staker2: SignerWithAddress
    let staking: Contract
    let stakingToken: Contract
    let rewardsDuration: BigNumber
    let maxPerWallet: BigNumber

    beforeEach(async () => {
        ;[owner, staker1, staker2] = await ethers.getSigners()

        const ERC20 = await ethers.getContractFactory(ERC20PresetFixedSupply.abi, ERC20PresetFixedSupply.bytecode)
        stakingToken = await ERC20.deploy('ERC20', 'ERC20', ethers.utils.parseEther('10000'), owner.address)
        await stakingToken.transfer(staker1.address, ethers.utils.parseEther('1000'))
        await stakingToken.transfer(staker2.address, ethers.utils.parseEther('1000'))

        const BounceStake = await ethers.getContractFactory('BounceStake')
        staking = await BounceStake.deploy()
        rewardsDuration = BigNumber.from('1000')
        maxPerWallet = ethers.utils.parseEther('10')
        await staking.initialize(stakingToken.address, rewardsDuration, maxPerWallet)
    })

    it('basic check', async () => {
        expect(await staking.stakingToken()).to.eq(stakingToken.address)
        expect(await staking.rewardsDuration()).to.eq(rewardsDuration)
        expect(await staking.maxPerWallet()).to.eq(maxPerWallet)
    })

    it('notifyRewardAmount', async () => {
        const reward = ethers.utils.parseEther('1000')
        await expect(staking.notifyRewardAmount(reward)).to.emit(staking, 'RewardAdded').withArgs(reward)
    })

    describe('Staking and Withdraw', () => {
        beforeEach(async () => {
            const reward = ethers.utils.parseEther('1000')
            await expect(staking.notifyRewardAmount(reward)).to.emit(staking, 'RewardAdded').withArgs(reward)
            expect(await staking.rewardRate()).to.be.eq(reward.div(rewardsDuration))
            expect(await staking.rewardRate()).to.be.eq(BigNumber.from('1000000000000000000'))
        })

        it('stake', async () => {
            const amount = ethers.utils.parseEther('10')
            stakingToken = stakingToken.connect(staker1)
            staking = staking.connect(staker1)
            await stakingToken.approve(staking.address, amount)
            await expect(staking.stake(amount)).to.emit(staking, 'Staked').withArgs(staker1.address, amount)
            expect(await stakingToken.balanceOf(staking.address)).to.be.eq(ethers.utils.parseEther('10'))
            expect(await stakingToken.balanceOf(staker1.address)).to.be.eq(ethers.utils.parseEther('990'))
        })

        it('withdraw', async () => {
            const amount = ethers.utils.parseEther('10')
            stakingToken = stakingToken.connect(staker1)
            staking = staking.connect(staker1)
            await stakingToken.approve(staking.address, amount)
            await expect(staking.stake(amount)).to.emit(staking, 'Staked').withArgs(staker1.address, amount)
            await expect(staking.withdraw(amount)).to.emit(staking, 'Withdrawn').withArgs(staker1.address, amount)
            expect(await stakingToken.balanceOf(staking.address)).to.be.eq(0)
            expect(await stakingToken.balanceOf(staker1.address)).to.be.eq(ethers.utils.parseEther('1000'))
        })
    })
})
