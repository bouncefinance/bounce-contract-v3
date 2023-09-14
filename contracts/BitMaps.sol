// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

library BitMaps {
    function get(uint256 bitmap, uint256 index) internal pure returns (bool) {
        uint256 mask = 1 << index;
        return bitmap & mask != 0;
    }

    function set(uint256 bitmap, uint256 index) internal pure returns (uint256) {
        uint256 mask = 1 << index;
        bitmap |= mask;
        return bitmap;
    }

    function unset(uint256 bitmap, uint256 index) internal pure returns (uint256) {
        uint256 mask = 1 << index;
        bitmap &= ~mask;
        return bitmap;
    }

    function getSetBitCount(uint256 bitmap, uint256 max) internal pure returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < max; i++) {
            if (get(bitmap, i)) {
                count++;
            }
        }

        return count;
    }

    function getSetBitPositions(uint256 bitmap, uint256 max) internal pure returns (uint256[] memory) {
        uint256 count = getSetBitCount(bitmap, max);
        uint256[] memory positions = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < max; i++) {
            if (get(bitmap, i)) {
                positions[index++] = i;
            }
        }

        return positions;
    }

    function normalize(uint256 bitmap, uint256 max) internal pure returns (uint256) {
        return bitmap & ((1 << max) - 1);
    }
}
