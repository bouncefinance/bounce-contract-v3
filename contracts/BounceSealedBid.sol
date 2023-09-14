// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./BounceBase.sol";

contract BounceSealedBid is BounceBase {
    using ECDSAUpgradeable for bytes32;
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
        uint256 amountMin1;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
        // whitelist merkle root
        bytes32 whitelistRoot;
    }

    struct Pool {
        // creator of the pool
        address creator;
        // address of token0
        address token0;
        // address of token1
        address token1;
        // total amount of token0
        uint256 amountTotal0;
        // minimum amount of token1
        uint256 amountMin1;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
    }

    Pool[] public pools;

    // pool index => a flat that if creator is claimed the pool
    mapping(uint256 => bool) public creatorClaimed;
    // pool index => total claimed amount0
    mapping(uint256 => uint256) public totalClaimedAmount0;
    // pool index => total bid amount1
    mapping(uint256 => uint256) public totalBidAmount1;
    // account => pool index => bid amount of token1
    mapping(address => mapping(uint256 => uint256)) public myAmountBid1;
    // account => pool index => claim flag
    mapping(address => mapping(uint256 => bool)) public myClaimed;
    // account => pool index => priceHash
    mapping(address => mapping(uint256 => bytes32)) public myPriceHash;
    // pool index => if reverse function enabled
    mapping(uint256 => bool) public enableReverses;

    event Created(
        uint256 indexed index,
        address indexed sender,
        Pool pool,
        string name,
        bytes32 whitelistRoot,
        uint256 id,
        bool auctionHodlerEnabled,
        bool reverseEnabled
    );
    event Bid(uint256 indexed index, address indexed sender, uint256 amount1, bytes32 priceHash);
    event CreatorClaimed(
        uint256 indexed index,
        address indexed sender,
        uint256 unFilledAmount0,
        uint256 actualAmount1,
        uint256 txFee
    );
    event UserClaimed(uint256 indexed index, address indexed sender, uint256 filledAmount0, uint256 unfilledAmount1);
    event Reversed(uint256 indexed index, address indexed sender, uint256 amount1);

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
        require(!ids[id], "id already exists");
        ids[id] = true;
        require(!(auctionToken == address(0) && enableAuctionHolder), "auctionToken is not set");
        require(releaseType != ReleaseType.Instant, "invalid releaseType");
        checkCreator(keccak256(abi.encode(id, PoolType.SealedBid)), expireAt, signature);

        uint256 index = _create(poolReq);
        auctionHolders[index] = enableAuctionHolder;
        setReleaseData(index, poolReq.claimAt, releaseType, releaseData);

        emit Created(
            index,
            msg.sender,
            pools[index],
            poolReq.name,
            whitelistRootP[index],
            id,
            enableAuctionHolder,
            enableReverse
        );
    }

    function _create(CreateReq memory poolReq) private returns (uint256) {
        require(poolReq.amountTotal0 != 0, "amountTotal0 is zero");
        require(poolReq.amountMin1 != 0, "amountMin1 is zero");
        require(poolReq.openAt >= block.timestamp, "invalid openAt");
        require(uint256(poolReq.closeAt).sub(poolReq.openAt) < 7 days, "invalid closeAt");
        require(poolReq.claimAt >= poolReq.closeAt, "invalid claimAt");
        require(bytes(poolReq.name).length <= 60, "name is too long");

        uint256 index = pools.length;

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
        pool.amountMin1 = poolReq.amountMin1;
        pool.openAt = poolReq.openAt;
        pool.closeAt = poolReq.closeAt;
        pool.claimAt = poolReq.claimAt;
        pools.push(pool);

        return index;
    }

    function bid(
        // pool index
        uint256 index,
        // amount of token1
        uint256 amount1,
        // priceHash = keccak256(abi.encode(index, sender, amount0, amount1, salt))
        bytes32 priceHash,
        // signMessage = keccak256(abi.encode(chainId, sender, priceHash))
        bytes memory priceHashSignature,
        bytes32[] memory proof
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        bytes32 leaf = keccak256(abi.encode(msg.sender));
        checkWhitelist(index, leaf, proof);
        _bid(index, amount1, priceHash, priceHashSignature);
    }

    function bidPermit(
        // pool index
        uint256 index,
        // amount of token1
        uint256 amount1,
        // priceHash = keccak256(abi.encode(index, sender, amount0, amount1, salt))
        bytes32 priceHash,
        // signMessage = keccak256(abi.encode(chainId, sender, priceHash))
        bytes memory priceHashSignature,
        uint256 expireAt,
        bytes memory signature
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        checkUser(keccak256(abi.encode(index, PoolType.SealedBid)), expireAt, signature);
        _bid(index, amount1, priceHash, priceHashSignature);
    }

    function _bid(
        // pool index
        uint256 index,
        // amount of token1
        uint256 amount1,
        // priceHash = keccak256(abi.encode(index, sender, amount0, amount1, salt))
        bytes32 priceHash,
        // signMessage = keccak256(abi.encode(chainId, sender, priceHash))
        bytes memory priceHashSignature
    ) private {
        require(!creatorClaimed[index], "creator claimed or pool canceled");
        checkAuctionHolder(index, msg.sender);

        Pool memory pool = pools[index];
        require(pool.openAt <= block.timestamp, "pool not open");
        require(amount1 != 0, "amount1 is zero");
        require(myAmountBid1[msg.sender][index] == 0, "already bid by sender");

        bytes32 signMessage = keccak256(abi.encode(block.chainid, msg.sender, priceHash));
        bytes32 hashMessage = signMessage.toEthSignedMessageHash();
        require(signer == hashMessage.recover(priceHashSignature), "invalid signature");

        address token1 = pool.token1;
        if (token1 == address(0)) {
            require(amount1 == msg.value, "invalid ETH amount");
        } else {
            IERC20Upgradeable(token1).safeTransferFrom(msg.sender, address(this), amount1);
        }

        totalBidAmount1[index] = totalBidAmount1[index].add(amount1);
        myAmountBid1[msg.sender][index] = amount1;
        myPriceHash[msg.sender][index] = priceHash;

        emit Bid(index, msg.sender, amount1, priceHash);
    }

    function creatorClaim(
        uint256 index,
        uint256 filledAmount0,
        uint256 filledAmount1,
        // signMessage = keccak256(abi.encode(chainID, index, sender, filledAmount0, filledAmount1))
        bytes memory signature
    ) external nonReentrant isPoolExist(index) {
        Pool memory pool = pools[index];
        require(pool.creator == msg.sender, "invalid pool creator");
        // Cancel before openAt or Claim after closeAt
        require(block.timestamp < pool.openAt || pool.closeAt < block.timestamp, "cannot claim during pool running");
        require(!creatorClaimed[index], "creator claimed or pool canceled");
        creatorClaimed[index] = true;
        require(filledAmount0 <= pool.amountTotal0, "filledAmount0 exceed");
        require(filledAmount1 <= totalBidAmount1[index], "filledAmount1 exceed");

        verifySignature(index, filledAmount0, filledAmount1, signature);

        // calculate transaction fee
        (uint256 actualAmount1, uint256 txFee) = claimAmount1(pool, filledAmount1);

        // calculate un-filled amount0
        uint256 unFilledAmount0 = pool.amountTotal0.sub(filledAmount0);
        require(totalClaimedAmount0[index].add(unFilledAmount0) <= pool.amountTotal0, "claimedAmount0 exceed");
        totalClaimedAmount0[index] = totalClaimedAmount0[index].add(unFilledAmount0);
        if (unFilledAmount0 > 0) {
            // transfer un-filled amount of token0 back to creator
            IERC20Upgradeable(pool.token0).safeTransfer(pool.creator, unFilledAmount0);
        }

        emit CreatorClaimed(index, msg.sender, unFilledAmount0, actualAmount1, txFee);
    }

    function userClaim(
        uint256 index,
        uint256 filledAmount0,
        uint256 filledAmount1,
        // signMessage = keccak256(abi.encode(chainID, index, sender, filledAmount0, filledAmount1))
        bytes memory signature
    ) external nonReentrant isPoolExist(index) isClaimReady(index) {
        require(!myClaimed[msg.sender][index], "bidder claimed");
        require(myAmountBid1[msg.sender][index] > 0, "no bid");
        require(filledAmount1 <= myAmountBid1[msg.sender][index], "filedAmount1 exceed");
        Pool memory pool = pools[index];
        require(totalClaimedAmount0[index].add(filledAmount0) <= pool.amountTotal0, "filledAmount0 exceed");
        totalClaimedAmount0[index] = totalClaimedAmount0[index].add(filledAmount0);

        verifySignature(index, filledAmount0, filledAmount1, signature);

        uint256 unFilledAmount1 = myAmountBid1[msg.sender][index].sub(filledAmount1);
        if (unFilledAmount1 > 0) {
            myAmountBid1[msg.sender][index] = filledAmount1;
            // transfer un-filled amount of token1 back to bidder
            if (pool.token1 == address(0)) {
                AddressUpgradeable.sendValue(payable(msg.sender), unFilledAmount1);
            } else {
                IERC20Upgradeable(pool.token1).safeTransfer(msg.sender, unFilledAmount1);
            }
        }

        uint256 actualReleaseAmount = 0;
        if (filledAmount0 > 0) {
            // transfer filled amount of token0 to bidder
            uint256 releaseAmount = computeReleasableAmount(index, filledAmount0);
            if (releaseAmount > 0) {
                actualReleaseAmount = releaseAmount.sub(myReleased[msg.sender][index]);
                if (actualReleaseAmount > 0) {
                    IERC20Upgradeable(pool.token0).safeTransfer(msg.sender, actualReleaseAmount);
                    myReleased[msg.sender][index] = releaseAmount;
                    if (myReleased[msg.sender][index] == filledAmount0) {
                        myClaimed[msg.sender][index] = true;
                    }
                }
            }
        }

        emit UserClaimed(index, msg.sender, actualReleaseAmount, unFilledAmount1);
    }

    function reverse(uint256 index, uint256 amount1) external nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        require(enableReverses[index], "Reverse is disabled");
        require(amount1 <= myAmountBid1[msg.sender][index], "invalid amount1");

        myAmountBid1[msg.sender][index] = myAmountBid1[msg.sender][index].sub(amount1);
        totalBidAmount1[index] = totalBidAmount1[index].sub(amount1);

        Pool memory pool = pools[index];
        // transfer token1 to sender
        if (pool.token1 == address(0)) {
            AddressUpgradeable.sendValue(payable(msg.sender), amount1);
        } else {
            IERC20Upgradeable(pool.token1).safeTransfer(msg.sender, amount1);
        }

        emit Reversed(index, msg.sender, amount1);
    }

    function verifySignature(
        uint256 index,
        uint256 filledAmount0,
        uint256 filledAmount1,
        bytes memory signature
    ) private view {
        bytes32 signMessage = keccak256(abi.encode(block.chainid, index, msg.sender, filledAmount0, filledAmount1));
        bytes32 hashMessage = signMessage.toEthSignedMessageHash();
        require(signer == hashMessage.recover(signature), "invalid signature");
    }

    function claimAmount1(
        Pool memory pool,
        uint256 filledAmount1
    ) private returns (uint256 actualAmount1, uint256 txFee) {
        // calculate transaction fee;
        txFee = filledAmount1.mul(txFeeRatio).div(TX_FEE_DENOMINATOR);
        actualAmount1 = filledAmount1.sub(txFee);
        if (pool.token1 == address(0)) {
            // calculate actual amount1;
            if (actualAmount1 > 0) {
                // transfer actual amount of token1 to creator
                AddressUpgradeable.sendValue(payable(pool.creator), actualAmount1);
            }
            if (txFee > 0) {
                // deposit transaction fee to staking contract
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = stakeContract.call{value: txFee}(abi.encodeWithSignature("depositReward()"));
                if (!success) {
                    revert("Revert: depositReward()");
                }
            }
        } else {
            if (actualAmount1 > 0) {
                IERC20Upgradeable(pool.token1).safeTransfer(pool.creator, actualAmount1);
            }
            if (txFee > 0) {
                IERC20Upgradeable(pool.token1).safeTransfer(stakeContract, txFee);
            }
        }
    }

    function getPoolCount() external view returns (uint256) {
        return pools.length;
    }

    modifier isPoolClosed(uint256 index) {
        require(pools[index].closeAt <= block.timestamp, "this pool is not closed");
        _;
    }

    modifier isPoolNotClosed(uint256 index) {
        require(pools[index].closeAt > block.timestamp, "this pool is closed");
        _;
    }

    modifier isClaimReady(uint256 index) {
        require(pools[index].claimAt <= block.timestamp, "claim not ready");
        _;
    }

    modifier isPoolExist(uint256 index) {
        require(index < pools.length, "this pool does not exist");
        _;
    }
}
