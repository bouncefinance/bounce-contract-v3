// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

contract BounceBase is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using ECDSAUpgradeable for bytes32;
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    enum PoolType {
        FixedSwap, // 0
        DutchAuction, // 1
        SealedBid, // 2
        Random, // 3
        FixedSwapNFT, // 4
        EnglishAuctionNFT, // 5
        RandomNFT, // 6
        EnglishAuction, // 7
        MutantEnglishAuctionNFT // 8
    }

    uint256 public constant TX_FEE_DENOMINATOR = 1e18;

    uint256 public txFeeRatio;
    address public stakeContract;
    address public signer;
    // pool index => whitelist merkle root
    mapping(uint256 => bytes32) public whitelistRootP;
    // address => pool message => pool message used or not
    mapping(address => mapping(bytes32 => bool)) public poolMessages;
    // pool index => if is auction holder enabled
    mapping(uint256 => bool) public auctionHolders;
    // minimum amount of AUCTION to hold
    uint256 public minimumAuction;
    // AUCTION token address
    address public auctionToken;
    // backend id
    mapping(uint256 => bool) public ids;

    enum ReleaseType {
        Instant, // 0
        Cliff, // 1
        Linear, // 2
        Fragment // 3
    }

    struct ReleaseData {
        uint64 startAt;
        // entAt in timestamp or ratio in 1e18
        uint64 endAtOrRatio;
    }

    // pool index => release type
    mapping(uint256 => ReleaseType) public releaseTypes;
    // pool index => release data
    mapping(uint256 => ReleaseData[]) public releaseDataList;
    // address => pool index => released amount
    mapping(address => mapping(uint256 => uint256)) public myReleased;

    event ReleaseDataSet(uint256 indexed index, ReleaseType releaseType, ReleaseData[] releaseDataList);

    function computeReleasableAmount(uint256 index, uint256 myTotalRelease) public view returns (uint256) {
        ReleaseData[] memory _releaseDataList = releaseDataList[index];
        if (_releaseDataList.length == 0 || block.timestamp < _releaseDataList[0].startAt) {
            return 0;
        }

        ReleaseType releaseType = releaseTypes[index];
        uint256 releasedAmount = 0;
        if (releaseType == ReleaseType.Cliff) {
            if (_releaseDataList[0].startAt <= block.timestamp) {
                releasedAmount = myTotalRelease;
            }
        } else if (releaseType == ReleaseType.Linear) {
            ReleaseData memory releaseTime = _releaseDataList[0];
            uint256 elapsedTime = 0;
            if (block.timestamp < releaseTime.endAtOrRatio) {
                elapsedTime = block.timestamp - releaseTime.startAt;
            } else {
                elapsedTime = uint256(releaseTime.endAtOrRatio) - releaseTime.startAt;
            }
            uint256 totalTime = uint256(releaseTime.endAtOrRatio) - releaseTime.startAt;
            releasedAmount = (myTotalRelease * elapsedTime) / totalTime;
        } else if (releaseType == ReleaseType.Fragment) {
            uint256 ratio = 0;
            for (uint256 i = 0; i < _releaseDataList.length; i++) {
                if (_releaseDataList[i].startAt <= block.timestamp) {
                    ratio = ratio + _releaseDataList[i].endAtOrRatio;
                }
            }
            releasedAmount = (myTotalRelease * ratio) / 1e18;
        }

        return releasedAmount;
    }

    function setReleaseData(
        uint256 index,
        uint48 claimAt,
        ReleaseType releaseType,
        ReleaseData[] memory releaseData
    ) internal {
        if (releaseType == ReleaseType.Instant) {
            require(claimAt == 0, "invalid claimAt");
            require(releaseData.length == 0, "Invalid releaseData length");
        } else if (releaseType == ReleaseType.Linear || releaseType == ReleaseType.Cliff) {
            require(claimAt != 0, "invalid claimAt");
            require(releaseData.length == 1, "Invalid releaseData length");
            require(claimAt == releaseData[0].startAt, "Require: claimAt == releaseStartAt");
            if (releaseType == ReleaseType.Linear) {
                require(releaseData[0].startAt < releaseData[0].endAtOrRatio, "Require: startAt < endAtOrRatio");
            }
        } else if (releaseType == ReleaseType.Fragment) {
            require(claimAt != 0, "invalid claimAt");
            require(releaseData.length >= 1, "Invalid releaseData length");
            require(claimAt == releaseData[0].startAt, "Require: claimAt == releaseStartAt");
            for (uint256 i = 1; i < releaseData.length; i++) {
                require(claimAt <= releaseData[i].startAt, "Require: claimAt <= releaseStartAt");
            }
            uint256 ratio = 0;
            for (uint256 i = 0; i < releaseData.length; i++) {
                ratio = ratio.add(releaseData[i].endAtOrRatio);
            }
            require(ratio == 1e18, "Total ratio must equal to 1e18");
        }

        releaseTypes[index] = releaseType;
        for (uint256 i = 0; i < releaseData.length; i++) {
            releaseDataList[index].push(releaseData[i]);
        }

        emit ReleaseDataSet(index, releaseType, releaseData);
    }

    function checkAuctionHolder(uint256 index, address target) internal view {
        if (auctionHolders[index]) {
            require(IERC20Upgradeable(auctionToken).balanceOf(target) >= minimumAuction, "Not auction holder");
        }
    }

    function setAuctionHolder(address _auctionToken, uint256 _minimumAuction) external onlyOwner {
        require(_auctionToken != address(0), "Invalid auction token");
        auctionToken = _auctionToken;
        minimumAuction = _minimumAuction;
    }

    function getReleaseDataListLength(uint256 index) external view returns (uint256) {
        return releaseDataList[index].length;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __BounceBase_init(uint256 _txFeeRatio, address _stakeContract, address _signer) internal onlyInitializing {
        super.__Ownable_init();
        super.__ReentrancyGuard_init();

        _setTxFeeRatio(_txFeeRatio);
        _setStakeContract(_stakeContract);
        _setSigner(_signer);
    }

    function transferAndCheck(address token0, address from, uint256 amount) internal {
        IERC20Upgradeable _token0 = IERC20Upgradeable(token0);
        uint256 token0BalanceBefore = _token0.balanceOf(address(this));
        _token0.safeTransferFrom(from, address(this), amount);
        require(_token0.balanceOf(address(this)).sub(token0BalanceBefore) == amount, "not support deflationary token");
    }

    function checkWhitelist(uint256 index, bytes32 leaf, bytes32[] memory proof) internal view {
        if (whitelistRootP[index] != bytes32(0)) {
            require(MerkleProofUpgradeable.verify(proof, whitelistRootP[index], leaf), "not whitelisted");
        }
    }

    function checkUser(bytes32 hash, uint256 expireAt, bytes memory signature) internal view {
        _verifySignature(hash, expireAt, signature);
    }

    function checkCreator(bytes32 hash, uint256 expireAt, bytes memory signature) internal {
        bytes32 message = _verifySignature(hash, expireAt, signature);
        require(!poolMessages[msg.sender][message], "pool message used");
        poolMessages[msg.sender][message] = true;
    }

    function _verifySignature(bytes32 hash, uint256 expireAt, bytes memory signature) private view returns (bytes32) {
        require(block.timestamp < expireAt, "signature expired");
        bytes32 message = keccak256(abi.encode(msg.sender, hash, block.chainid, expireAt));
        bytes32 hashMessage = message.toEthSignedMessageHash();
        require(signer == hashMessage.recover(signature), "invalid signature");
        return message;
    }

    function setTxFeeRatio(uint256 _txFeeRatio) external onlyOwner {
        _setTxFeeRatio(_txFeeRatio);
    }

    function setStakeContract(address _stakeContract) external onlyOwner {
        _setStakeContract(_stakeContract);
    }

    function setSigner(address _signer) external onlyOwner {
        _setSigner(_signer);
    }

    function _setTxFeeRatio(uint256 _txFeeRatio) private {
        require(_txFeeRatio <= TX_FEE_DENOMINATOR, "invalid txFeeRatio");
        txFeeRatio = _txFeeRatio;
    }

    function _setStakeContract(address _stakeContract) private {
        require(_stakeContract != address(0), "invalid stakeContract");
        stakeContract = _stakeContract;
    }

    function _setSigner(address _signer) private {
        require(_signer != address(0), "invalid signer");
        signer = _signer;
    }

    uint256[38] private __gap;
}
