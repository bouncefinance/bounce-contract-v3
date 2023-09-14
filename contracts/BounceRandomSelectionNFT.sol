// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "./BounceNftBase.sol";
import "./Random.sol";

contract BounceRandomSelectionNFT is BounceNftBase, Random {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct CreateReq {
        // pool name
        string name;
        //NFT token
        address token0;
        //erc20 or eth
        address token1;
        //NFT id
        uint256[] tokenIds;
        // total amount of token id of token0
        uint256 amountTotal0;
        uint256 amount1PerWallet;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
        // max player num
        uint16 maxPlayer;
        // share num
        uint16 nShare;
        // flag indicate if the pool is for ERC721 or ERC1155
        bool isERC721;
        // whitelist merkle root
        bytes32 whitelistRoot;
    }

    struct Pool {
        // address of pool creator
        address creator;
        //NFT token
        address token0;
        //erc20 or eth
        address token1;
        //NFT id
        uint256[] tokenIds;
        // total amount of token id of token0
        uint256 amountTotal0;
        uint256 amount1PerWallet;
        // the timestamp in seconds the pool will open
        uint48 openAt;
        // the timestamp in seconds the pool will be closed
        uint48 closeAt;
        // the delay timestamp in seconds when buyers can claim after pool filled
        uint48 claimAt;
        // max player num
        uint16 maxPlayer;
        uint16 curPlayer;
        // share num
        uint16 nShare;
        // flag indicate if the pool is for ERC721 or ERC1155
        bool isERC721;
    }

    Pool[] public pools;

    // request id => pool id
    mapping(uint256 => uint256) public requestIdToIndexes;
    // pool id => winner seed set
    mapping(uint256 => uint256) public winnerSeed;
    // pool id => random requested
    mapping(uint256 => bool) public randomRequested;
    // pool id => claimed
    mapping(uint256 => uint256) public claimId;
    // player => pool id => Serial number-start from 1
    mapping(address => mapping(uint256 => uint256)) public betNo;

    event Created(
        uint256 indexed index,
        address indexed sender,
        Pool pool,
        string name,
        bytes32 whitelistRoot,
        uint256 id,
        bool auctionHodlerEnabled
    );
    event Bet(uint256 indexed index, address indexed sender);
    event CreatorClaimed(uint256 indexed index, address indexed sender);
    event UserClaimed(uint256 indexed index, address indexed sender, uint256 tokenIdOrAmount0);
    event RandomRequested(uint256 indexed index, address indexed sender, uint256 requestId);
    event WinnerSeedSet(uint256 indexed index, uint256 seed);

    function initialize(
        uint256 _txFeeRatio,
        address _stakeContract,
        address _signer,
        address _vrfCoordinator,
        address _linkTokenContract,
        bytes32 _keyHash
    ) public initializer {
        super.__BounceBase_init(_txFeeRatio, _stakeContract, _signer);
        super.__Random_init(_vrfCoordinator, _linkTokenContract, _keyHash);
        subId = super.createNewSubscription();
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
        checkCreator(keccak256(abi.encode(id, PoolType.RandomNFT)), expireAt, signature);

        uint256 index = _create(poolReq);
        auctionHolders[index] = enableAuctionHolder;
        setReleaseData(index, poolReq.claimAt, releaseType, releaseData);

        emit Created(index, msg.sender, pools[index], poolReq.name, whitelistRootP[index], id, enableAuctionHolder);
    }

    function _create(CreateReq memory poolReq) private returns (uint256) {
        require(poolReq.amountTotal0 >= poolReq.nShare, "amountTotal0 less than nShare");
        require(poolReq.nShare != 0, "nShare is zero");
        require(poolReq.nShare <= poolReq.maxPlayer, "max player less than nShare");
        require(poolReq.maxPlayer > 0, "maxPlayer is zero");
        require(poolReq.openAt >= block.timestamp, "invalid openAt");
        require(poolReq.closeAt > poolReq.openAt, "invalid closeAt");
        require(poolReq.claimAt >= poolReq.closeAt, "invalid claimAt");
        require(bytes(poolReq.name).length <= 60, "name is too long");

        uint256 index = pools.length;

        if (poolReq.whitelistRoot != bytes32(0)) {
            whitelistRootP[index] = poolReq.whitelistRoot;
        }

        // transfer tokenId of token0 to this contract
        if (poolReq.isERC721) {
            require(poolReq.amountTotal0 <= MAX_ERC721, "exceed maximum number of tokenId");
            require(poolReq.amountTotal0 == poolReq.tokenIds.length, "invalid amountTotal0");
            require(poolReq.nShare <= poolReq.tokenIds.length, "amountTotal0 less than nShare");
            for (uint256 id = 0; id < poolReq.tokenIds.length; id++) {
                IERC721Upgradeable(poolReq.token0).safeTransferFrom(msg.sender, address(this), poolReq.tokenIds[id]);
            }
        } else {
            require(poolReq.amountTotal0 >= poolReq.nShare, "amountTotal0 less than nShare");
            require(poolReq.tokenIds.length == 1, "invalid tokenIds length");
            IERC1155Upgradeable(poolReq.token0).safeTransferFrom(
                msg.sender,
                address(this),
                poolReq.tokenIds[0],
                poolReq.amountTotal0,
                ""
            );
        }

        // create pool
        Pool memory pool;
        pool.creator = msg.sender;
        pool.token0 = poolReq.token0;
        pool.token1 = poolReq.token1;
        pool.tokenIds = poolReq.tokenIds;
        pool.amountTotal0 = poolReq.amountTotal0;
        pool.amount1PerWallet = poolReq.amount1PerWallet;
        pool.openAt = poolReq.openAt;
        pool.closeAt = poolReq.closeAt;
        pool.claimAt = poolReq.claimAt;
        pool.maxPlayer = poolReq.maxPlayer;
        pool.nShare = poolReq.nShare;
        pool.isERC721 = poolReq.isERC721;
        pools.push(pool);

        return index;
    }

    function bet(
        uint256 index,
        bytes32[] memory proof
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        bytes32 leaf = keccak256(abi.encode(msg.sender));
        checkWhitelist(index, leaf, proof);
        _bet(index);
    }

    function betPermit(
        uint256 index,
        uint256 expireAt,
        bytes memory signature
    ) external payable nonReentrant isPoolExist(index) isPoolNotClosed(index) {
        checkUser(keccak256(abi.encode(index, PoolType.RandomNFT)), expireAt, signature);
        _bet(index);
    }

    function _bet(uint256 index) private {
        checkAuctionHolder(index, msg.sender);

        Pool memory pool = pools[index];
        require(betNo[msg.sender][index] == 0, "already bet");
        require(pool.openAt <= block.timestamp, "pool not open");
        require(pool.curPlayer < pool.maxPlayer, "reached upper limit");
        checkCreatorClaimed(index);

        pools[index].curPlayer += 1;
        betNo[msg.sender][index] = pools[index].curPlayer;

        if (pool.token1 == address(0)) {
            require(msg.value == pool.amount1PerWallet, "invalid amount of ETH");
        } else {
            IERC20Upgradeable(pool.token1).safeTransferFrom(msg.sender, address(this), pool.amount1PerWallet);
        }

        emit Bet(index, msg.sender);
    }

    function creatorClaim(uint256 index) external nonReentrant isPoolExist(index) {
        Pool memory pool = pools[index];
        require(pool.creator == msg.sender, "invalid pool creator");
        // Cancel before openAt or Claim after closeAt
        require(block.timestamp < pool.openAt || pool.closeAt < block.timestamp, "cannot claim during pool running");
        checkAndSetCreatorClaimed(index);

        uint256 share = pool.nShare <= pool.curPlayer ? pool.nShare : pool.curPlayer;
        if (pool.isERC721) {
            for (uint256 id = share; id < pool.tokenIds.length; id++) {
                IERC721Upgradeable(pool.token0).safeTransferFrom(address(this), pool.creator, pool.tokenIds[id]);
            }
        } else {
            IERC1155Upgradeable(pool.token0).safeTransferFrom(
                address(this),
                pool.creator,
                pool.tokenIds[0],
                (pool.amountTotal0 * (pool.nShare - share)) / pool.nShare,
                ""
            );
        }

        tokenTransfer(pool.token1, msg.sender, pool.amount1PerWallet * share);

        emit CreatorClaimed(index, msg.sender);
    }

    function userClaim(uint256 index) external nonReentrant isPoolExist(index) isClaimReady(index) {
        require(!myClaimed[msg.sender][index], "claimed");
        require(winnerSeed[index] > 0, "waiting seed");
        require(betNo[msg.sender][index] > 0, "no bet");

        Pool memory pool = pools[index];
        if (isWinner(index, msg.sender)) {
            if (pool.isERC721) {
                uint256 share = pool.nShare <= pool.curPlayer ? pool.nShare : pool.curPlayer;
                require(claimId[index] + 1 <= share, "exceed max claim");
                IERC721Upgradeable(pool.token0).safeTransferFrom(
                    address(this),
                    msg.sender,
                    pool.tokenIds[claimId[index]]
                );
                claimId[index] += 1;
                myClaimed[msg.sender][index] = true;
                emit UserClaimed(index, msg.sender, pool.tokenIds[claimId[index]]);
            } else {
                uint256 releaseAmount = computeReleasableAmount(index, pool.amountTotal0 / pool.nShare);
                if (releaseAmount > 0) {
                    uint256 actualReleaseAmount = releaseAmount.sub(myReleased[msg.sender][index]);
                    if (actualReleaseAmount > 0) {
                        IERC1155Upgradeable(pool.token0).safeTransferFrom(
                            address(this),
                            msg.sender,
                            pool.tokenIds[0],
                            pool.amountTotal0 / pool.nShare,
                            ""
                        );
                        myReleased[msg.sender][index] = releaseAmount;
                        if (myReleased[msg.sender][index] == pool.amountTotal0 / pool.nShare) {
                            myClaimed[msg.sender][index] = true;
                        }
                        emit UserClaimed(index, msg.sender, actualReleaseAmount);
                    }
                }
            }
        } else {
            tokenTransfer(pool.token1, msg.sender, pool.amount1PerWallet);
            myClaimed[msg.sender][index] = true;
            emit UserClaimed(index, msg.sender, 0);
        }
    }

    function requestRandom(uint256 index) external nonReentrant isPoolExist(index) isPoolClosed(index) {
        require(pools[index].curPlayer > 0, "no bet");
        require(!randomRequested[index], "Random already requested");
        randomRequested[index] = true;
        uint256 requestId = requestRandomWords(subId);
        requestIdToIndexes[requestId] = index;

        emit RandomRequested(index, msg.sender, requestId);
    }

    function lo2(uint256 value) public pure returns (uint256) {
        require(value < 65536, "too large");
        if (value <= 2) return uint256(0);
        else if (value == 3) return uint256(2);
        uint256 x = 0;
        uint256 s = value;
        while (value > 1) {
            value >>= 1;
            x++;
        }
        if (s > ((2 << (x - 1)) + (2 << (x - 2)))) return (x * 2 + 1);
        return x * 2;
    }

    function calcRet(uint256 index, uint256 m) public pure returns (uint256) {
        uint256[32] memory p = [
            uint256(3),
            3,
            5,
            7,
            17,
            11,
            7,
            11,
            13,
            23,
            31,
            47,
            61,
            89,
            127,
            191,
            251,
            383,
            509,
            761,
            1021,
            1531,
            2039,
            3067,
            4093,
            6143,
            8191,
            12281,
            16381,
            24571,
            32749,
            49139
        ];
        uint256 nSel = lo2(m);
        return (index * p[nSel]) % m;
    }

    function isWinner(uint256 index, address sender) public view returns (bool) {
        Pool memory pool = pools[index];

        require(pool.closeAt < block.timestamp, "this pool is not closed");
        if (betNo[sender][index] == 0) {
            return false;
        }
        uint256 nShare = pool.nShare;
        uint256 curPlayer = pool.curPlayer;
        if (curPlayer <= nShare) {
            return true;
        }

        uint256 n = winnerSeed[index] - 1;

        uint256 pos = calcRet(betNo[sender][index] - 1, curPlayer);

        if ((n + nShare) % curPlayer > n) {
            if (pos >= n && pos < (n + nShare)) {
                return true;
            }
        } else {
            if (pos >= n && pos < curPlayer) {
                return true;
            }
            if (pos < (n + nShare) % curPlayer) {
                return true;
            }
        }

        return false;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 index = requestIdToIndexes[requestId];
        if (winnerSeed[index] == 0) {
            winnerSeed[index] = (randomWords[0] % pools[index].curPlayer) + 1;
            emit WinnerSeedSet(index, winnerSeed[index]);
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
