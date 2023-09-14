// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./BounceBase.sol";

contract BounceFixedSwap is BounceBase {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct CreateReq {
        // pool name
        string name;
        // address of sell token
        address token0;
        // address of buy token
        address token1;
        // total amount of token0
        uint256 amountTotal0;
        // total amount of token1
        uint256 amountTotal1;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
        uint256 maxAmount1PerWallet;
        // whitelist merkle root
        bytes32 whitelistRoot;
    }

    struct Pool {
        // creator of the pool
        address creator;
        // address of sell token
        address token0;
        // address of buy token
        address token1;
        // total amount of token0
        uint256 amountTotal0;
        // total amount of token1
        uint256 amountTotal1;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
    }

    Pool[] public pools;

    // pool index => the timestamp which the pool filled at
    mapping(uint256 => uint256) public filledAtP;
    // pool index => swap amount of token0
    mapping(uint256 => uint256) public amountSwap0P;
    // pool index => swap amount of token1
    mapping(uint256 => uint256) public amountSwap1P;
    // pool index => maximum swap amount1 per wallet. Default is zero
    mapping(uint256 => uint256) public maxAmount1PerWalletP;
    // pool index => a flag that if creator is claimed the pool
    mapping(uint256 => bool) public creatorClaimedP;
    // user address => pool index => swapped amount of token0
    mapping(address => mapping(uint256 => uint256)) public myAmountSwapped0;
    // user address => pool index => swapped amount of token1
    mapping(address => mapping(uint256 => uint256)) public myAmountSwapped1;
    // user address => pool index => whether or not my pool has been claimed
    mapping(address => mapping(uint256 => bool)) public myClaimed;
    // pool index => if it is playable auction
    mapping(uint256 => bool) public isPlayableAuction;
    // pool index => if reverse function enabled
    mapping(uint256 => bool) public enableReverses;

    event Created(
        uint256 indexed index,
        address indexed sender,
        Pool pool,
        string name,
        bytes32 whitelistRoot,
        uint256 maxAmount1PerWallet,
        uint256 id,
        bool auctionHodlerEnabled,
        bool reverseEnabled,
        bool isPlayableAuction
    );
    event Swapped(uint256 indexed index, address indexed sender, uint256 amount0, uint256 amount1);
    event CreatorClaimed(
        uint256 indexed index,
        address indexed sender,
        uint256 amount0,
        uint256 amount1,
        uint256 txFee
    );
    event UserClaimed(uint256 indexed index, address indexed sender, uint256 amount0);
    event Reversed(uint256 indexed index, address indexed sender, uint256 amount0, uint256 amount1);

    function initialize(uint256 _txFeeRatio, address _stakeContract, address _signer) public initializer {
        super.__BounceBase_init(_txFeeRatio, _stakeContract, _signer);
    }

    function createV2(
        uint256 id,
        CreateReq memory poolReq,
        ReleaseType releaseType,
        ReleaseData[] memory releaseData,
        bool enableAuctionHolder,
        bool enableReverse,
        uint256 expireAt,
        bytes memory signature
    ) external nonReentrant {
        uint256 index = _createV2(
            id,
            poolReq,
            releaseType,
            releaseData,
            enableAuctionHolder,
            enableReverse,
            expireAt,
            signature
        );

        emit Created(
            index,
            msg.sender,
            pools[index],
            poolReq.name,
            whitelistRootP[index],
            maxAmount1PerWalletP[index],
            id,
            enableAuctionHolder,
            enableReverse,
            isPlayableAuction[index]
        );
    }

    function createPlayableV2(
        uint256 id,
        CreateReq memory poolReq,
        ReleaseType releaseType,
        ReleaseData[] memory releaseData,
        bool enableAuctionHolder,
        bool enableReverse,
        uint256 expireAt,
        bytes memory signature
    ) external nonReentrant {
        uint256 index = _createV2(
            id,
            poolReq,
            releaseType,
            releaseData,
            enableAuctionHolder,
            enableReverse,
            expireAt,
            signature
        );
        isPlayableAuction[index] = true;

        emit Created(
            index,
            msg.sender,
            pools[index],
            poolReq.name,
            whitelistRootP[index],
            maxAmount1PerWalletP[index],
            id,
            enableAuctionHolder,
            enableReverse,
            isPlayableAuction[index]
        );
    }

    function _createV2(
        uint256 id,
        CreateReq memory poolReq,
        ReleaseType releaseType,
        ReleaseData[] memory releaseData,
        bool enableAuctionHolder,
        bool enableReverse,
        uint256 expireAt,
        bytes memory signature
    ) private returns (uint256) {
        require(!ids[id], "id already exists");
        ids[id] = true;
        checkCreator(keccak256(abi.encode(id, PoolType.FixedSwap)), expireAt, signature);
        uint256 index = _create(poolReq);
        require(!(auctionToken == address(0) && enableAuctionHolder), "auctionToken is not set");

        auctionHolders[index] = enableAuctionHolder;
        enableReverses[index] = enableReverse;
        setReleaseData(index, poolReq.claimAt, releaseType, releaseData);
        return index;
    }

    function _create(CreateReq memory poolReq) private returns (uint256) {
        require(poolReq.amountTotal0 != 0, "invalid amountTotal0");
        require(poolReq.amountTotal1 != 0, "invalid amountTotal1");
        require(poolReq.openAt >= block.timestamp, "invalid openAt");
        require(poolReq.closeAt > poolReq.openAt, "invalid closeAt");
        require(poolReq.claimAt == 0 || poolReq.claimAt >= poolReq.closeAt, "invalid claimAt");
        require(bytes(poolReq.name).length <= 60, "name is too long");

        uint256 index = pools.length;

        if (poolReq.maxAmount1PerWallet != 0) {
            maxAmount1PerWalletP[index] = poolReq.maxAmount1PerWallet;
        }

        if (poolReq.whitelistRoot != bytes32(0)) {
            whitelistRootP[index] = poolReq.whitelistRoot;
        }

        // transfer amount of token0 to this contract
        transferAndCheck(poolReq.token0, msg.sender, poolReq.amountTotal0);

        Pool memory pool;
        pool.creator = msg.sender;
        pool.token0 = poolReq.token0;
        pool.token1 = poolReq.token1;
        pool.amountTotal0 = poolReq.amountTotal0;
        pool.amountTotal1 = poolReq.amountTotal1;
        pool.openAt = poolReq.openAt;
        pool.closeAt = poolReq.closeAt;
        pool.claimAt = poolReq.claimAt;
        pools.push(pool);

        return index;
    }

    function swap(
        uint256 index,
        uint256 amount1,
        bytes32[] memory proof
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        require(!isPlayableAuction[index], "not fixed swap");
        bytes32 leaf = keccak256(abi.encode(msg.sender));
        checkWhitelist(index, leaf, proof);
        _swap(index, amount1);
    }

    function swapPermit(
        uint256 index,
        uint256 amount1,
        uint256 expireAt,
        bytes memory signature
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        require(!isPlayableAuction[index], "not fixed swap");
        checkUser(keccak256(abi.encode(index, PoolType.FixedSwap)), expireAt, signature);
        _swap(index, amount1);
    }

    function swapPlayable(
        uint256 index,
        uint256 amount1,
        uint256 quota1,
        bytes32[] memory proof
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        require(isPlayableAuction[index], "not playable auction");
        require(myAmountSwapped0[msg.sender][index] + amount1 <= quota1, "exceed quota1");
        bytes32 leaf = keccak256(abi.encode(msg.sender, quota1));
        checkWhitelist(index, leaf, proof);
        _swap(index, amount1);
    }

    function _swap(uint256 index, uint256 amount1) private {
        Pool memory pool = pools[index];
        require(pool.openAt <= block.timestamp, "pool not open");
        require(pool.amountTotal1 > amountSwap1P[index], "swap amount is zero");
        require(!creatorClaimedP[index], "pool canceled");
        checkAuctionHolder(index, msg.sender);

        // check if amount1 is exceeded
        uint256 excessAmount1 = 0;
        uint256 _amount1 = pool.amountTotal1.sub(amountSwap1P[index]);
        if (_amount1 < amount1) {
            excessAmount1 = amount1.sub(_amount1);
        } else {
            _amount1 = amount1;
        }

        // check if amount0 is exceeded
        uint256 amount0 = _amount1.mul(pool.amountTotal0).div(pool.amountTotal1);
        uint256 _amount0 = pool.amountTotal0.sub(amountSwap0P[index]);
        if (_amount0 > amount0) {
            _amount0 = amount0;
        }

        amountSwap0P[index] = amountSwap0P[index].add(_amount0);
        amountSwap1P[index] = amountSwap1P[index].add(_amount1);
        myAmountSwapped0[msg.sender][index] = myAmountSwapped0[msg.sender][index].add(_amount0);
        myAmountSwapped1[msg.sender][index] = myAmountSwapped1[msg.sender][index].add(_amount1);
        // check if swapped amount of token1 is exceeded maximum allowance
        if (maxAmount1PerWalletP[index] != 0) {
            require(myAmountSwapped1[msg.sender][index] <= maxAmount1PerWalletP[index], "swapped1 exceeded");
        }

        if (pool.amountTotal1 == amountSwap1P[index]) {
            filledAtP[index] = block.timestamp;
        }

        // transfer amount of token1 to this contract
        if (pool.token1 == address(0)) {
            require(msg.value == amount1, "invalid amount of ETH");
        } else {
            IERC20Upgradeable(pool.token1).safeTransferFrom(msg.sender, address(this), amount1);
        }

        if (pool.claimAt == 0) {
            if (_amount0 > 0) {
                // send token0 to msg.sender
                IERC20Upgradeable(pool.token0).safeTransfer(msg.sender, _amount0);
            }
        }
        if (excessAmount1 > 0) {
            // send excess amount of token1 back to msg.sender
            if (pool.token1 == address(0)) {
                AddressUpgradeable.sendValue(payable(msg.sender), excessAmount1);
            } else {
                IERC20Upgradeable(pool.token1).safeTransfer(msg.sender, excessAmount1);
            }
        }

        emit Swapped(index, msg.sender, _amount0, _amount1);
    }

    function creatorClaim(uint256 index) external nonReentrant isPoolExist(index) {
        Pool memory pool = pools[index];
        require(pool.creator == msg.sender, "invalid pool creator");
        // Cancel before openAt or Claim after closeAt
        require(block.timestamp < pool.openAt || pool.closeAt < block.timestamp, "cannot claim during pool running");
        require(!creatorClaimedP[index], "creator claimed");
        creatorClaimedP[index] = true;

        // send token1 to creator
        uint256 txFee = amountSwap1P[index].mul(txFeeRatio).div(TX_FEE_DENOMINATOR);
        uint256 _amount1 = amountSwap1P[index].sub(txFee);
        if (_amount1 > 0) {
            if (pool.token1 == address(0)) {
                AddressUpgradeable.sendValue(payable(pool.creator), _amount1);
            } else {
                IERC20Upgradeable(pool.token1).safeTransfer(pool.creator, _amount1);
            }
        }

        if (txFee > 0) {
            if (pool.token1 == address(0)) {
                // deposit transaction fee to staking contract
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = stakeContract.call{value: txFee}(abi.encodeWithSignature("depositReward()"));
                if (!success) {
                    revert("Revert: depositReward()");
                }
            } else {
                IERC20Upgradeable(pool.token1).safeTransfer(stakeContract, txFee);
            }
        }

        uint256 unSwapAmount0 = pool.amountTotal0.sub(amountSwap0P[index]);
        if (unSwapAmount0 > 0) {
            IERC20Upgradeable(pool.token0).safeTransfer(pool.creator, unSwapAmount0);
        }

        emit CreatorClaimed(index, msg.sender, unSwapAmount0, _amount1, txFee);
    }

    function userClaim(uint256 index) external nonReentrant isPoolExist(index) isClaimReady(index) {
        require(!myClaimed[msg.sender][index], "claimed");

        Pool memory pool = pools[index];
        if (releaseDataList[index].length > 0) {
            uint256 releaseAmount = computeReleasableAmount(index, myAmountSwapped0[msg.sender][index]);
            if (releaseAmount > 0) {
                uint256 actualReleaseAmount = releaseAmount.sub(myReleased[msg.sender][index]);
                if (actualReleaseAmount > 0) {
                    IERC20Upgradeable(pool.token0).safeTransfer(msg.sender, actualReleaseAmount);
                    myReleased[msg.sender][index] = releaseAmount;

                    if (myReleased[msg.sender][index] == myAmountSwapped0[msg.sender][index]) {
                        myClaimed[msg.sender][index] = true;
                    }

                    emit UserClaimed(index, msg.sender, actualReleaseAmount);
                }
            }
        } else {
            if (myAmountSwapped0[msg.sender][index] > 0) {
                // send token0 to msg.sender
                IERC20Upgradeable(pool.token0).safeTransfer(msg.sender, myAmountSwapped0[msg.sender][index]);
            }
            myClaimed[msg.sender][index] = true;

            emit UserClaimed(index, msg.sender, myAmountSwapped0[msg.sender][index]);
        }
    }

    function reverse(uint256 index, uint256 amount0) external nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        require(enableReverses[index], "Reverse is disabled");
        require(amount0 <= myAmountSwapped0[msg.sender][index], "invalid amount0");

        uint256 amount1 = amount0.mul(myAmountSwapped1[msg.sender][index]).div(myAmountSwapped0[msg.sender][index]);
        myAmountSwapped0[msg.sender][index] = myAmountSwapped0[msg.sender][index].sub(amount0);
        myAmountSwapped1[msg.sender][index] = myAmountSwapped1[msg.sender][index].sub(amount1);
        amountSwap0P[index] = amountSwap0P[index].sub(amount0);
        amountSwap1P[index] = amountSwap1P[index].sub(amount1);

        Pool memory pool = pools[index];
        if (pool.claimAt == 0) {
            // send token0 to this contract
            IERC20Upgradeable(pool.token0).safeTransferFrom(msg.sender, address(this), amount0);
        }

        // transfer token1 to sender
        if (pool.token1 == address(0)) {
            AddressUpgradeable.sendValue(payable(msg.sender), amount1);
        } else {
            IERC20Upgradeable(pool.token1).safeTransfer(msg.sender, amount1);
        }

        emit Reversed(index, msg.sender, amount0, amount1);
    }

    function getPoolCount() public view returns (uint256) {
        return pools.length;
    }

    modifier isPoolNotClosed(uint256 index) {
        require(pools[index].closeAt > block.timestamp, "this pool is closed");
        _;
    }

    modifier isClaimReady(uint256 index) {
        require(pools[index].claimAt != 0, "invalid claim");
        require(pools[index].claimAt <= block.timestamp, "claim not ready");
        _;
    }

    modifier isPoolExist(uint256 index) {
        require(index < pools.length, "this pool does not exist");
        _;
    }
}
