// SPDX-License-Identifier: GPL-3.0

/* solhint-disable */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract MockStakeSimple is OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public auctionToken;

    // total amount of staking
    uint256 public totalStake;
    // total amount of received reward
    uint256 public totalReward;
    // total amount of claimed reward
    uint256 public totalClaimedReward;

    // deprecated, index => amount of daily staking
    mapping(uint32 => uint256) public dailyStake;
    // deprecated, date index => amount of daily reward
    mapping(uint32 => uint256) public dailyReward;
    // deprecated, date index => amount of daily reward
    mapping(uint32 => uint256) public dailyClaimedReward;

    // account => amount of daily staking
    mapping(address => uint256) public myTotalStake;
    // deprecated, account => date index => if my reward is claimed
    mapping(address => mapping(uint32 => bool)) public myRewardClaimed;

    // account => sequence number => amount of un-staking
    mapping(address => mapping(uint32 => uint256)) public myUnStake;
    // account => sequence number => the end time in seconds of un-staking
    mapping(address => mapping(uint32 => uint32)) public myUnStakeEndAt;
    // address => array of sequence number
    mapping(address => uint32[]) public myUnStakes;
    // address => last time of claim reward
    mapping(address => uint256) public lastTimeOf;

    event Staked(address sender, uint256 amount);
    event UnStaked(address sender, uint256 amount);
    event RewardClaimed(address sender, uint256 amount);
    event Withdrawn(address sender, uint256 amount);

    function initialize(address _auctionToken) public initializer {
        super.__Ownable_init();
        auctionToken = _auctionToken;
    }

    function depositReward() external payable {
        totalReward = totalReward.add(msg.value);
    }

    function staking(uint256 amount) external {
        claimReward();

        address sender = msg.sender;
        require(amount > 0, "amount is zero.");

        IERC20Upgradeable _stakeToken = IERC20Upgradeable(getStakeToken());
        _stakeToken.transferFrom(sender, address(this), amount); // transfer amount of staking to contract
        _stakeToken.approve(address(this), 0); // reset allowance to 0

        myTotalStake[sender] = myTotalStake[sender].add(amount); // increasing total amount of stake
        totalStake = totalStake.add(amount);

        emit Staked(sender, amount);
    }

    function unStaking(uint256 amount) public virtual {
        claimReward();

        address sender = msg.sender;
        require(amount > 0, "amount is zero");
        require(totalStake >= amount, "totalStake should larger than or equal to amount");
        require(myTotalStake[sender] >= amount, "my stake should larger than or equal to amount");

        myTotalStake[sender] = myTotalStake[sender].sub(amount); // decreasing total amount of stake
        totalStake = totalStake.sub(amount);

        IERC20Upgradeable(getStakeToken()).transfer(sender, amount);

        emit UnStaked(sender, amount);
    }

    function claimReward() public {
        address sender = msg.sender;
        uint256 reward = calculateReward(sender);
        totalClaimedReward = totalClaimedReward.add(reward);

        AddressUpgradeable.sendValue(payable(sender), reward);

        lastTimeOf[sender] = block.timestamp;

        emit RewardClaimed(sender, reward);
    }

    uint256 constant MAX_SPAN = 30 days;

    function calculateReward(address target) public view returns (uint256) {
        uint256 span = block.timestamp.sub(lastTimeOf[target]);
        if (span > MAX_SPAN) {
            span = MAX_SPAN;
        }
        if (totalStake == 0) {
            return 0;
        }
        return address(this).balance.mul(myTotalStake[target]).div(totalStake).mul(span).div(MAX_SPAN);
    }

    function calculateWithdraw(address target) public view returns (uint256) {
        uint256 amount = 0;
        for (uint32 i = 0; i < myUnStakes[target].length; i++) {
            uint32 sn = myUnStakes[target][i];
            if (myUnStakeEndAt[target][sn] <= block.timestamp) {
                amount = amount.add(myUnStake[target][sn]);
            }
        }

        return amount;
    }

    function calculateUnStake(address target) public view returns (uint256) {
        return myTotalStake[target];
    }

    function removeArray(uint32[] storage array, uint32 index) private returns (uint32[] storage) {
        require(index < array.length, "index out of range.");

        if (index < array.length - 1) {
            for (uint32 i = index; i < array.length - 1; i++) {
                array[i] = array[i + 1];
            }
        }
        array.pop();

        return array;
    }

    function currentDateIndex() public view returns (uint32) {
        return uint32(block.timestamp.div(1 days));
    }

    function prevDateIndex() private view returns (uint32) {
        return currentDateIndex() - 1;
    }

    function getStakeToken() public view returns (address) {
        return auctionToken;
    }

    function withdrawFeeETH(address to, uint amount) external onlyOwner {
        AddressUpgradeable.sendValue(payable(to), amount);
    }

    function withdrawFee(address token, address to, uint amount) external onlyOwner {
        IERC20Upgradeable(token).safeTransfer(to, amount);
    }
}
