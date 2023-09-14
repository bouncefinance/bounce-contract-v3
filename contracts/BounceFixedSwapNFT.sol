// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "./BounceNftBase.sol";
import "./BitMaps.sol";

contract BounceFixedSwapNFT is BounceNftBase {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using BitMaps for uint256;

    struct CreateReq {
        // pool name
        string name;
        // address of sell token
        address token0;
        // address of buy token
        address token1;
        // token id of token0
        uint256[] tokenIds;
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
        // flag indicate if the pool is for ERC721 or ERC1155
        bool isERC721;
        // pool index => maximum swap amount0 per wallet. Default is zero
        uint256 maxAmount0PerWallet;
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
        // total amount of token1
        uint256 amountTotal1;
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

    // pool index => swapped amount of token0 or token Ids
    mapping(uint256 => uint256) public amountSwap0;
    // pool index => swapped amount of token1
    mapping(uint256 => uint256) public amountSwap1;
    // user address => pool index => swapped amount of token0 or token Ids
    mapping(address => mapping(uint256 => uint256)) public myAmountSwapped0;
    // user address => pool index => swapped amount of token1
    mapping(address => mapping(uint256 => uint256)) public myAmountSwapped1;
    // pool index => maximum swap amount0 per wallet. Default is zero
    mapping(uint256 => uint256) public maxAmount0PerWallet;
    // pool index => if reverse function enabled
    mapping(uint256 => bool) public enableReverses;

    event Created(
        uint256 indexed index,
        address indexed sender,
        Pool pool,
        string name,
        bytes32 whitelistRoot,
        uint256 maxAmount0PerWallet,
        uint256 id,
        bool auctionHodlerEnabled,
        bool reverseEnabled
    );
    event Swapped(uint256 indexed index, address indexed sender, uint256 amount0OrTokenIds, uint256 amount1);
    event CreatorClaimed(
        uint256 indexed index,
        address indexed sender,
        uint256 amount0OrTokenIds,
        uint256 amount1,
        uint256 txFee
    );
    event UserClaimed(uint256 indexed index, address indexed sender, uint256 amount0OrTokenIds);
    event Reversed(uint256 indexed index, address indexed sender, uint256 amount0OrTokenIds, uint256 amount1);

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
        if (poolReq.isERC721) {
            require(releaseType == ReleaseType.Instant || releaseType == ReleaseType.Cliff, "invalid releaseType");
        }
        checkCreator(keccak256(abi.encode(id, PoolType.FixedSwapNFT)), expireAt, signature);

        uint256 index = _create(poolReq);
        auctionHolders[index] = enableAuctionHolder;
        enableReverses[index] = enableReverse;
        setReleaseData(index, poolReq.claimAt, releaseType, releaseData);

        emit Created(
            index,
            msg.sender,
            pools[index],
            poolReq.name,
            whitelistRootP[index],
            maxAmount0PerWallet[index],
            id,
            enableAuctionHolder,
            enableReverse
        );
    }

    function _create(CreateReq memory poolReq) private returns (uint256) {
        require(poolReq.amountTotal1 != 0, "invalid amountTotal1");
        require(poolReq.openAt >= block.timestamp, "invalid openAt");
        require(poolReq.closeAt > poolReq.openAt, "invalid closeAt");
        require(poolReq.claimAt == 0 || poolReq.claimAt >= poolReq.closeAt, "invalid claimAt");
        require(bytes(poolReq.name).length <= 60, "name is too long");

        uint256 index = pools.length;

        if (poolReq.maxAmount0PerWallet != 0) {
            maxAmount0PerWallet[index] = poolReq.maxAmount0PerWallet;
        }

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
        pool.amountTotal1 = poolReq.amountTotal1;
        pool.openAt = poolReq.openAt;
        pool.closeAt = poolReq.closeAt;
        pool.claimAt = poolReq.claimAt;
        pool.isERC721 = poolReq.isERC721;
        pools.push(pool);

        return index;
    }

    function swap(
        uint256 index,
        uint256 amount0OrTokenIds,
        bytes32[] memory proof
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        bytes32 leaf = keccak256(abi.encode(msg.sender));
        checkWhitelist(index, leaf, proof);
        _swap(index, amount0OrTokenIds);
    }

    function swapPermit(
        uint256 index,
        uint256 amount0OrTokenIds,
        uint256 expireAt,
        bytes memory signature
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        checkUser(keccak256(abi.encode(index, PoolType.FixedSwapNFT)), expireAt, signature);
        _swap(index, amount0OrTokenIds);
    }

    function _swap(uint256 index, uint256 amount0OrTokenIds) private {
        checkAuctionHolder(index, msg.sender);

        Pool memory pool = pools[index];
        require(pool.openAt <= block.timestamp, "pool not open");
        require(amount0OrTokenIds >= 1, "invalid amount0OrTokenIds");

        checkCreatorClaimed(index);

        uint256 _amount0 = 0;
        if (pool.isERC721) {
            require(pool.amountTotal0 > amountSwap0[index].getSetBitCount(pool.amountTotal0), "swap amount is zero");
            amount0OrTokenIds = amount0OrTokenIds.normalize(pool.amountTotal0);
            // remove swapped token id
            amount0OrTokenIds = (amount0OrTokenIds ^ amountSwap0[index]) & amount0OrTokenIds;
            amountSwap0[index] = amountSwap0[index] | amount0OrTokenIds;
            myAmountSwapped0[msg.sender][index] = myAmountSwapped0[msg.sender][index] | amount0OrTokenIds;
            if (maxAmount0PerWallet[index] != 0) {
                require(
                    myAmountSwapped0[msg.sender][index].getSetBitCount(pool.amountTotal0) <= maxAmount0PerWallet[index],
                    "swapped0 exceeded"
                );
            }

            _amount0 = amount0OrTokenIds.getSetBitCount(pool.amountTotal0);
            if (pool.claimAt == 0) {
                // transfer tokenIds of token0 to sender
                uint256[] memory positions = amount0OrTokenIds.getSetBitPositions(pool.amountTotal0);
                for (uint256 i = 0; i < positions.length; i++) {
                    uint256 tokenId = pool.tokenIds[positions[i]];
                    IERC721Upgradeable(pool.token0).safeTransferFrom(address(this), msg.sender, tokenId);
                }
            }
        } else {
            require(pool.amountTotal0 > amountSwap0[index], "swap amount is zero");
            if (amount0OrTokenIds > pool.amountTotal0 - amountSwap0[index]) {
                amount0OrTokenIds = pool.amountTotal0 - amountSwap0[index];
            }
            amountSwap0[index] = amountSwap0[index] + amount0OrTokenIds;
            myAmountSwapped0[msg.sender][index] = myAmountSwapped0[msg.sender][index] + amount0OrTokenIds;
            if (maxAmount0PerWallet[index] != 0) {
                require(myAmountSwapped0[msg.sender][index] <= maxAmount0PerWallet[index], "swapped0 exceeded");
            }

            _amount0 = amount0OrTokenIds;
            if (pool.claimAt == 0) {
                // transfer tokenId of token0 to sender
                IERC1155Upgradeable(pool.token0).safeTransferFrom(
                    address(this),
                    msg.sender,
                    pool.tokenIds[0],
                    amount0OrTokenIds,
                    ""
                );
            }
        }

        // transfer amount of token1 to this contract
        uint256 amount1 = (_amount0 * pool.amountTotal1) / pool.amountTotal0;
        amountSwap1[index] = amountSwap1[index] + amount1;
        myAmountSwapped1[msg.sender][index] = myAmountSwapped1[msg.sender][index] + amount1;
        if (pool.token1 == address(0)) {
            require(msg.value >= amount1, "invalid amount of ETH");
            // send excess amount of token1 back to msg.sender
            if (msg.value > amount1) {
                tokenTransfer(pool.token1, msg.sender, msg.value - amount1);
            }
        } else {
            IERC20Upgradeable(pool.token1).safeTransferFrom(msg.sender, address(this), amount1);
        }

        emit Swapped(index, msg.sender, amount0OrTokenIds, amount1);
    }

    function creatorClaim(uint256 index) external nonReentrant isPoolExist(index) {
        Pool memory pool = pools[index];
        require(pool.creator == msg.sender, "invalid pool creator");
        // Cancel before openAt or Claim after closeAt
        require(block.timestamp < pool.openAt || pool.closeAt < block.timestamp, "cannot claim during pool running");
        checkAndSetCreatorClaimed(index);

        // send token1 to creator
        uint256 txFee = (amountSwap1[index] * txFeeRatio) / TX_FEE_DENOMINATOR;
        uint256 _amount1 = amountSwap1[index] - txFee;
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

        uint256 unSwapAmount0OrTokenIds = 0;
        if (pool.isERC721) {
            uint256 totalTokenIds = (1 << pool.amountTotal0) - 1;
            unSwapAmount0OrTokenIds = totalTokenIds & (~amountSwap0[index]);
            uint256[] memory positions = unSwapAmount0OrTokenIds.getSetBitPositions(pool.amountTotal0);
            for (uint256 i = 0; i < positions.length; i++) {
                uint256 tokenId = pool.tokenIds[positions[i]];
                IERC721Upgradeable(pool.token0).safeTransferFrom(address(this), msg.sender, tokenId);
            }
        } else {
            unSwapAmount0OrTokenIds = pool.amountTotal0 - amountSwap0[index];
            IERC1155Upgradeable(pool.token0).safeTransferFrom(
                address(this),
                msg.sender,
                pool.tokenIds[0],
                unSwapAmount0OrTokenIds,
                ""
            );
        }

        emit CreatorClaimed(index, msg.sender, unSwapAmount0OrTokenIds, _amount1, txFee);
    }

    function userClaim(uint256 index) external nonReentrant isPoolExist(index) isClaimReady(index) {
        require(!myClaimed[msg.sender][index], "claimed");

        Pool memory pool = pools[index];
        if (pool.isERC721) {
            uint256[] memory positions = myAmountSwapped0[msg.sender][index].getSetBitPositions(pool.amountTotal0);
            for (uint256 i = 0; i < positions.length; i++) {
                uint256 tokenId = pool.tokenIds[positions[i]];
                IERC721Upgradeable(pool.token0).safeTransferFrom(address(this), msg.sender, tokenId);
            }
            myClaimed[msg.sender][index] = true;
            emit UserClaimed(index, msg.sender, myAmountSwapped0[msg.sender][index]);
        } else {
            uint256 releaseAmount = computeReleasableAmount(index, myAmountSwapped0[msg.sender][index]);
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
                    if (myReleased[msg.sender][index] == myAmountSwapped0[msg.sender][index]) {
                        myClaimed[msg.sender][index] = true;
                    }
                    emit UserClaimed(index, msg.sender, actualReleaseAmount);
                }
            }
        }
    }

    function reverse(
        uint256 index,
        uint256 amount0OrTokenIds
    ) external nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        require(enableReverses[index], "Reverse is disabled");

        uint256 amount1 = 0;
        Pool memory pool = pools[index];
        // send token0 to this contract
        if (pool.isERC721) {
            amount0OrTokenIds = amount0OrTokenIds.normalize(pool.amountTotal0);
            require(
                (amount0OrTokenIds != 0) &&
                    (amount0OrTokenIds & myAmountSwapped0[msg.sender][index] == amount0OrTokenIds),
                "invalid amount0OrTokenIds"
            );

            uint256 _amount0 = amount0OrTokenIds.getSetBitCount(pool.amountTotal0);
            amount1 =
                (amount0OrTokenIds.getSetBitCount(pool.amountTotal0) * myAmountSwapped1[msg.sender][index]) /
                _amount0;
            myAmountSwapped0[msg.sender][index] = myAmountSwapped0[msg.sender][index] & (~amount0OrTokenIds);
            amountSwap0[index] = amountSwap0[index] & (~amount0OrTokenIds);

            if (pool.claimAt == 0) {
                uint256[] memory positions = amount0OrTokenIds.getSetBitPositions(pool.amountTotal0);
                for (uint256 i = 0; i < positions.length; i++) {
                    uint256 tokenId = pool.tokenIds[positions[i]];
                    IERC721Upgradeable(pool.token0).safeTransferFrom(msg.sender, address(this), tokenId);
                }
            }
        } else {
            require(amount0OrTokenIds <= myAmountSwapped0[msg.sender][index], "invalid amount0OrTokenIds");
            amount1 = (amount0OrTokenIds * myAmountSwapped1[msg.sender][index]) / myAmountSwapped0[msg.sender][index];
            myAmountSwapped0[msg.sender][index] = myAmountSwapped0[msg.sender][index] - amount0OrTokenIds;
            amountSwap0[index] = amountSwap0[index] - amount0OrTokenIds;

            if (pool.claimAt == 0) {
                IERC1155Upgradeable(pool.token0).safeTransferFrom(
                    msg.sender,
                    address(this),
                    pool.tokenIds[0],
                    amount0OrTokenIds,
                    ""
                );
            }
        }

        myAmountSwapped1[msg.sender][index] = myAmountSwapped1[msg.sender][index] - amount1;
        amountSwap1[index] = amountSwap1[index] - amount1;

        // transfer token1 to sender
        tokenTransfer(pool.token1, msg.sender, amount1);

        emit Reversed(index, msg.sender, amount0OrTokenIds, amount1);
    }

    function getTokenIdsByIndex(uint256 index) external view returns (uint256[] memory) {
        return pools[index].tokenIds;
    }

    function getTokenIdsByBitmap(uint256 index, uint256 bitmap) external view returns (uint256[] memory) {
        Pool memory pool = pools[index];
        bitmap = bitmap.normalize(pool.amountTotal0);
        uint256[] memory positions = bitmap.getSetBitPositions(pool.amountTotal0);
        uint256[] memory tokenIds = new uint256[](positions.length);
        for (uint256 i = 0; i < positions.length; i++) {
            tokenIds[i] = pool.tokenIds[positions[i]];
        }
        return tokenIds;
    }

    function getPoolCount() external view returns (uint256) {
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
