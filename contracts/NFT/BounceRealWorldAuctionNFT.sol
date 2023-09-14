// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

contract BounceRealWorldAuctionNFT is ERC721Upgradeable, OwnableUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;

    CountersUpgradeable.Counter private _tokenIdTracker;
    string private _baseTokenURI;

    function initialize(string memory _name, string memory _symbol, string memory __baseTokenURI) public initializer {
        __Ownable_init();
        __ERC721_init(_name, _symbol);
        _baseTokenURI = __baseTokenURI;
    }

    function mint(address to) external onlyOwner {
        _mint(to, _tokenIdTracker.current());
        _tokenIdTracker.increment();
    }

    function setBaseURI(string memory __baseTokenURI) external onlyOwner {
        _baseTokenURI = __baseTokenURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
