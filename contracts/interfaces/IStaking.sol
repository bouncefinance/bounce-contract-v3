// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

interface IStaking {
    function stakingShare(address target) external returns (uint256);
}
