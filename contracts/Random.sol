// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract Random is OwnableUpgradeable {
    VRFCoordinatorV2Interface public coordinator;
    LinkTokenInterface public linkToken;

    // The gas lane to use, which specifies the maximum gas price to bump to.
    // For a list of available gas lanes on each network,
    // see https://docs.chain.link/docs/vrf-contracts/#configurations
    bytes32 public keyHash;

    // A reasonable default is 100000, but this value could be different
    // on other networks.
    uint32 public callbackGasLimit;

    // The default is 3, but you can set this higher.
    uint16 public requestConfirmations;

    // For this example, retrieve 2 random values in one request.
    // Cannot exceed VRFCoordinatorV2.MAX_NUM_WORDS.
    uint32 public numWords;

    // subscription id
    uint64 public subId;

    // solhint-disable-next-line func-name-mixedcase
    function __Random_init(
        address _vrfCoordinator,
        address _linkTokenContract,
        bytes32 _keyHash
    ) internal onlyInitializing {
        __Ownable_init();
        coordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        linkToken = LinkTokenInterface(_linkTokenContract);
        keyHash = _keyHash;
        callbackGasLimit = 100000;
        requestConfirmations = 3;
        numWords = 1;
    }

    // Assumes the subscription is funded sufficiently.
    function requestRandomWords(uint64 subscriptionId) internal returns (uint256 requestId) {
        // Will revert if subscription is not set and funded.
        requestId = coordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
    }

    // Create a new subscription when the contract is initially deployed.
    function createNewSubscription() internal returns (uint64 subscriptionId) {
        subscriptionId = coordinator.createSubscription();
        // Add this contract as a consumer of its own subscription.
        coordinator.addConsumer(subscriptionId, address(this));
    }

    function createSubscription() external onlyOwner {
        createNewSubscription();
    }

    function cancelSubscription(uint64 subscriptionId, address receivingWallet) external onlyOwner {
        // Cancel the subscription and send the remaining LINK to a wallet address.
        coordinator.cancelSubscription(subscriptionId, receivingWallet);
    }

    // Assumes this contract owns link.
    // 1000000000000000000 = 1 LINK
    function topUpSubscription(uint64 subscriptionId, uint256 amount) external onlyOwner {
        linkToken.transferAndCall(address(coordinator), amount, abi.encode(subscriptionId));
    }

    function topUpCurrentSubscription(uint256 amount) external onlyOwner {
        linkToken.transferAndCall(address(coordinator), amount, abi.encode(subId));
    }

    // Transfer this contract's funds to an address.
    // 1000000000000000000 = 1 LINK
    function withdraw(uint256 amount, address to) external onlyOwner {
        linkToken.transfer(to, amount);
    }

    function withdrawLinkToken(address to, uint256 amount) external onlyOwner {
        linkToken.transfer(to, amount);
    }

    /**
     * @notice fulfillRandomness handles the VRF response. Your contract must
     * @notice implement it. See "SECURITY CONSIDERATIONS" above for important
     * @notice principles to keep in mind when implementing your fulfillRandomness
     * @notice method.
     *
     * @dev VRFConsumerBaseV2 expects its subcontracts to have a method with this
     * @dev signature, and will call it once it has verified the proof
     * @dev associated with the randomness. (It is triggered via a call to
     * @dev rawFulfillRandomness, below.)
     *
     * @param requestId The Id initially returned by requestRandomness
     * @param randomWords the VRF output expanded to the requested number of words
     */
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal virtual;

    // rawFulfillRandomness is called by coordinator when it receives a valid VRF
    // proof. rawFulfillRandomness then calls fulfillRandomness, after validating
    // the origin of the call
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != address(coordinator)) {
            revert OnlyCoordinatorCanFulfill(msg.sender, address(coordinator));
        }
        fulfillRandomWords(requestId, randomWords);
    }

    error OnlyCoordinatorCanFulfill(address have, address want);
}
