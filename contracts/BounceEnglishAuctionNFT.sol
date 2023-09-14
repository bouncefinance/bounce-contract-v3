// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "./BounceNftBase.sol";

contract BounceEnglishAuctionNFT is BounceNftBase {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct CreateReq {
        // name of the pool
        string name;
        // address of token0
        address token0;
        // address of token1
        address token1;
        // token id of token0
        uint256[] tokenIds;
        // total amount of token0
        uint256 amountTotal0;
        // minimum amount of token1
        uint256 amountMin1;
        // minimum incremental amount of token1
        uint256 amountMinIncr1;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
        // flag indicate if the pool is for ERC721 or ERC1155
        bool isERC721;
        // whitelist merkle root
        bytes32 whitelistRoot;
    }

    struct Pool {
        // address of pool creator
        address creator;
        // address of sell token
        address token0;
        // address of buy token
        address token1;
        // token id of token0
        uint256[] tokenIds;
        // total amount of token0
        uint256 amountTotal0;
        // minimum amount of token1 that creator want to swap
        uint256 amountMin1;
        // minimum incremental amount of token1
        uint256 amountMinIncr1;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
        // flag indicate if the pool is for ERC721 or ERC1155
        bool isERC721;
    }

    Pool[] public pools;

    // pool index => the candidate of winner who bid the highest amount1 in current round
    mapping(uint256 => address) public currentBidder;
    // pool index => the highest amount1 in current round
    mapping(uint256 => uint256) public currentBidderAmount1;
    // pool index = gas fee paid by previous bidder
    mapping(uint256 => uint256) public gasFee;

    event Created(
        uint256 indexed index,
        address indexed sender,
        Pool pool,
        string name,
        bytes32 whitelistRoot,
        uint256 id,
        bool auctionHodlerEnabled
    );
    event Bid(uint256 indexed index, address indexed sender, uint256 amount1);
    event CreatorClaimed(uint256 indexed index, address indexed sender, uint256 amount0, uint256 amount1);
    event BidderClaimed(uint256 indexed index, address indexed sender, uint256 amount0);

    function initialize(uint256 _txFeeRatio, address _stakeContract, address _signer) public initializer {
        super.__BounceBase_init(_txFeeRatio, _stakeContract, _signer);
    }

    function createV2(
        uint256 id,
        CreateReq memory poolReq,
        ReleaseType releaseType,
        ReleaseData[] memory releaseData,
        bool enableAuctionHolder,
        uint256 expireAt,
        bytes memory signature
    ) external nonReentrant {
        require(!ids[id], "id already exists");
        ids[id] = true;
        require(!(auctionToken == address(0) && enableAuctionHolder), "auctionToken is not set");
        if (poolReq.isERC721) {
            require(releaseType == ReleaseType.Cliff, "invalid releaseType");
        } else {
            require(releaseType != ReleaseType.Instant, "invalid releaseType");
        }
        checkCreator(keccak256(abi.encode(id, PoolType.EnglishAuctionNFT)), expireAt, signature);

        uint256 index = _create(poolReq);
        auctionHolders[index] = enableAuctionHolder;
        setReleaseData(index, poolReq.claimAt, releaseType, releaseData);

        emit Created(index, msg.sender, pools[index], poolReq.name, whitelistRootP[index], id, enableAuctionHolder);
    }

    function _create(CreateReq memory poolReq) private returns (uint256) {
        require(poolReq.amountMinIncr1 != 0, "invalid amountMinIncr1");
        require(poolReq.openAt >= block.timestamp, "invalid openAt");
        require(poolReq.closeAt > poolReq.openAt, "invalid closeAt");
        require(poolReq.claimAt >= poolReq.closeAt, "invalid claimAt");
        require(bytes(poolReq.name).length <= 60, "name is too long");

        uint256 index = pools.length;

        if (poolReq.whitelistRoot != bytes32(0)) {
            whitelistRootP[index] = poolReq.whitelistRoot;
        }

        // transfer tokenIds of token0 to this contract
        if (poolReq.isERC721) {
            require(poolReq.amountTotal0 <= MAX_ERC721, "exceed maximum number of tokenId");
            require(poolReq.amountTotal0 == poolReq.tokenIds.length, "invalid amountTotal0");
            for (uint256 i = 0; i < poolReq.tokenIds.length; i++) {
                IERC721Upgradeable(poolReq.token0).safeTransferFrom(msg.sender, address(this), poolReq.tokenIds[i]);
            }
        } else {
            require(poolReq.amountTotal0 > 0, "invalid amountTotal0");
            require(poolReq.tokenIds.length == 1, "invalid tokenIds length");
            IERC1155Upgradeable(poolReq.token0).safeTransferFrom(
                msg.sender,
                address(this),
                poolReq.tokenIds[0],
                poolReq.amountTotal0,
                ""
            );
        }

        // creator pool
        Pool memory pool;
        pool.creator = msg.sender;
        pool.token0 = poolReq.token0;
        pool.token1 = poolReq.token1;
        pool.tokenIds = poolReq.tokenIds;
        pool.amountTotal0 = poolReq.amountTotal0;
        pool.amountMin1 = poolReq.amountMin1;
        pool.amountMinIncr1 = poolReq.amountMinIncr1;
        pool.openAt = poolReq.openAt;
        pool.closeAt = poolReq.closeAt;
        pool.claimAt = poolReq.claimAt;
        pool.isERC721 = poolReq.isERC721;
        pools.push(pool);

        return index;
    }

    function bid(
        uint256 index,
        uint256 amount1,
        bytes32[] memory proof
    ) external payable nonReentrant gasMeter(index) isPoolExist(index) isPoolNotClosed(index) {
        bytes32 leaf = keccak256(abi.encode(msg.sender));
        checkWhitelist(index, leaf, proof);
        _bid(index, amount1);
    }

    function bidPermit(
        uint256 index,
        uint256 amount1,
        uint256 expireAt,
        bytes memory signature
    ) external payable nonReentrant gasMeter(index) isPoolExist(index) isPoolNotClosed(index) {
        checkUser(keccak256(abi.encode(index, PoolType.EnglishAuctionNFT)), expireAt, signature);
        _bid(index, amount1);
    }

    function _bid(uint256 index, uint256 amount1) private {
        checkAuctionHolder(index, msg.sender);

        Pool memory pool = pools[index];
        require(pool.openAt <= block.timestamp, "pool not open");
        require(amount1 != 0, "invalid amount1");
        require(amount1 >= pool.amountMin1, "lower than minimum price");
        require(amount1 >= currentBidderAmount(index), "lower than current price");
        checkCreatorClaimed(index);

        if (pool.token1 == address(0)) {
            require(msg.value == gasFee[index] + amount1, "invalid amount of ETH");
        } else {
            require(msg.value == gasFee[index], "invalid amount of ETH");
            IERC20Upgradeable(pool.token1).safeTransferFrom(msg.sender, address(this), amount1);
        }

        // return ETH to previous bidder
        if (currentBidder[index] != address(0) && currentBidderAmount1[index] > 0) {
            tokenTransfer(pool.token1, currentBidder[index], currentBidderAmount1[index]);
        }

        // record new winner
        /* solhint-disable reentrancy */
        currentBidder[index] = msg.sender;
        currentBidderAmount1[index] = amount1;
        /* solhint-enable reentrancy */

        emit Bid(index, msg.sender, amount1);
    }

    function creatorClaim(uint256 index) external nonReentrant isPoolExist(index) {
        Pool memory pool = pools[index];
        require(pool.creator == msg.sender, "invalid pool creator");
        // Cancel before openAt or Claim after closeAt
        require(block.timestamp < pool.openAt || pool.closeAt < block.timestamp, "cannot claim during pool running");
        checkAndSetCreatorClaimed(index);

        uint256 amount1 = currentBidderAmount1[index];
        if (currentBidder[index] != address(0)) {
            uint256 txFee = (amount1 * txFeeRatio) / TX_FEE_DENOMINATOR;
            uint256 _amount1 = amount1 - txFee;
            if (_amount1 > 0) {
                tokenTransfer(pool.token1, pool.creator, _amount1);
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
            emit CreatorClaimed(index, pool.creator, 0, amount1);
        } else {
            // transfer token0 back to creator
            if (pool.isERC721) {
                for (uint256 i = 0; i < pool.tokenIds.length; i++) {
                    IERC721Upgradeable(pool.token0).safeTransferFrom(address(this), pool.creator, pool.tokenIds[i]);
                }
            } else {
                IERC1155Upgradeable(pool.token0).safeTransferFrom(
                    address(this),
                    pool.creator,
                    pool.tokenIds[0],
                    pool.amountTotal0,
                    ""
                );
            }

            emit CreatorClaimed(index, pool.creator, pool.amountTotal0, 0);
        }
    }

    function bidderClaim(uint256 index) external nonReentrant isPoolExist(index) isClaimReady(index) {
        require(currentBidder[index] == msg.sender, "not winner");
        require(!myClaimed[msg.sender][index], "claimed");

        Pool memory pool = pools[index];
        // transfer token0 to bidder
        if (pool.isERC721) {
            for (uint256 i = 0; i < pool.tokenIds.length; i++) {
                IERC721Upgradeable(pool.token0).safeTransferFrom(address(this), msg.sender, pool.tokenIds[i]);
            }
            myClaimed[msg.sender][index] = true;
            emit BidderClaimed(index, msg.sender, pool.amountTotal0);
        } else {
            uint256 releaseAmount = computeReleasableAmount(index, pool.amountTotal0);
            if (releaseAmount > 0) {
                uint256 actualReleaseAmount = releaseAmount.sub(myReleased[msg.sender][index]);
                if (actualReleaseAmount > 0) {
                    IERC1155Upgradeable(pool.token0).safeTransferFrom(
                        address(this),
                        msg.sender,
                        pool.tokenIds[0],
                        actualReleaseAmount,
                        ""
                    );
                    myReleased[msg.sender][index] = releaseAmount;
                    if (myReleased[msg.sender][index] == pool.amountTotal0) {
                        myClaimed[msg.sender][index] = true;
                    }
                    emit BidderClaimed(index, msg.sender, actualReleaseAmount);
                }
            }
        }
    }

    function currentBidderAmount(uint256 index) public view returns (uint256) {
        Pool memory pool = pools[index];
        uint256 amount = pool.amountMin1;

        if (currentBidder[index] != address(0)) {
            amount = currentBidderAmount1[index] + pool.amountMinIncr1;
        } else if (pool.amountMin1 == 0) {
            amount = pool.amountMinIncr1;
        }

        return amount;
    }

    function getPoolCount() external view returns (uint256) {
        return pools.length;
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

    modifier gasMeter(uint256 index) {
        uint256 startGas = gasleft();
        if (currentBidder[index] != address(0) && gasFee[index] > 0) {
            // return gas fee to previous bidder
            AddressUpgradeable.sendValue(payable(currentBidder[index]), gasFee[index]);
        }
        _;
        uint256 adjustGas = gasFee[index] == 0 ? 46270 : 29170;
        gasFee[index] = (startGas - gasleft() + adjustGas) * tx.gasprice;
    }
}
