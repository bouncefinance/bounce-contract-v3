// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "./BitMaps.sol";
import "./BounceBase.sol";

contract BounceNftBase is BounceBase {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using BitMaps for uint256;

    uint256 public constant MAX_ERC721 = 32;

    // pool index => flag indicate if creator is claimed the pool
    mapping(uint256 => bool) public creatorClaimed;
    // user address => pool index => flag indicate my pool has been claimed
    mapping(address => mapping(uint256 => bool)) public myClaimed;

    function tokenTransfer(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            AddressUpgradeable.sendValue(payable(to), amount);
        } else {
            IERC20Upgradeable(token).safeTransfer(to, amount);
        }
    }

    function checkUserClaimed(address target, uint256 index) internal view {
        require(!myClaimed[target][index], "claimed");
    }

    function checkAndSetUserClaimed(address target, uint256 index) internal {
        checkUserClaimed(target, index);
        myClaimed[target][index] = true;
    }

    function checkCreatorClaimed(uint256 index) internal view {
        require(!creatorClaimed[index], "creator claimed or pool canceled");
    }

    function checkAndSetCreatorClaimed(uint256 index) internal {
        checkCreatorClaimed(index);
        creatorClaimed[index] = true;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    uint256[48] private __gap;
}
