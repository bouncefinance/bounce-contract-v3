// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract MockAuction is ERC20Capped {
    constructor() ERC20Capped(10000000e18) ERC20("Bounce Token", "AUCTION") {
        super._mint(msg.sender, 10000000e18);
    }
}
