// SPDX-License-Identifier: MIT

pragma solidity 0.5.17;

import "./ReentrancyGuard.sol";
import "./Pausable.sol";
import "./libraries/Math.sol";
import "./libraries/SafeERC20.sol";
import "./interfaces/IERC20.sol";
import "./libraries/SafeMath.sol";

contract MultiRewards is ReentrancyGuard, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    struct Reward {
        uint256 periodFinish;
        uint256 rewardRate;
        uint256 rewardsDuration;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }

    IERC20 public stakingToken;
    mapping(address => Reward) public rewardData;
    address[] public rewardTokens;

    // user -> reward token -> amount
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _stakingToken) public Owned(_owner) {
        stakingToken = IERC20(_stakingToken);
    }

    /* ========== VIEWS ========== */

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable(address _rewardsToken) public view returns (uint256) {
        return Math.min(block.timestamp, rewardData[_rewardsToken].periodFinish);
    }

    function rewardPerToken(address _rewardsToken) public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardData[_rewardsToken].rewardPerTokenStored;
        }
        return rewardData[_rewardsToken].rewardPerTokenStored.add(
            lastTimeRewardApplicable(_rewardsToken)
            .sub(rewardData[_rewardsToken].lastUpdateTime)
            .mul(rewardData[_rewardsToken].rewardRate)
            .mul(1e18)
            .div(_totalSupply)
        );
    }

    function earned(address account, address _rewardsToken) public view returns (uint256) {
        return _balances[account]
        .mul(rewardPerToken(_rewardsToken).sub(userRewardPerTokenPaid[account][_rewardsToken]))
        .div(1e18)
        .add(rewards[account][_rewardsToken]);
    }

    function getRewardForDuration(address _rewardsToken) external view returns (uint256) {
        return rewardData[_rewardsToken].rewardRate.mul(rewardData[_rewardsToken].rewardsDuration);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function stake(uint256 amount) external nonReentrant notPaused updateReward(msg.sender) {
        require(amount > 0, 'Cannot stake 0');
        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit AccountStakeSnapshot(msg.sender, _balances[msg.sender]);
        emit SupplySnapshot(_totalSupply);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        require(amount > 0, 'Cannot withdraw 0');
        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);
        stakingToken.safeTransfer(msg.sender, amount);

        emit AccountStakeSnapshot(msg.sender, _balances[msg.sender]);
        emit SupplySnapshot(_totalSupply);
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        for (uint256 i; i < rewardTokens.length; i++) {
            address _rewardsToken = rewardTokens[i];
            uint256 reward = rewards[msg.sender][_rewardsToken];
            if (reward > 0) {
                rewards[msg.sender][_rewardsToken] = 0;
                IERC20(_rewardsToken).safeTransfer(msg.sender, reward);

                emit RewardPaid(msg.sender, _rewardsToken, reward);
            }
        }
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function addReward(address _rewardsToken, uint256 _rewardsDuration) external onlyOwner {
        require(rewardData[_rewardsToken].rewardsDuration == 0);
        rewardTokens.push(_rewardsToken);
        rewardData[_rewardsToken].rewardsDuration = _rewardsDuration;

        optimisticAssociation(_rewardsToken);

        emit RewardAdded(_rewardsToken, _rewardsDuration);
    }

    function notifyRewardAmount(address _rewardsToken, uint256 reward) external onlyOwner updateReward(address(0)) {
        // handle the transfer of reward tokens via `transferFrom` to reduce the number
        // of transactions required and ensure correctness of the reward amount
        IERC20(_rewardsToken).safeTransferFrom(msg.sender, address(this), reward);

        if (block.timestamp >= rewardData[_rewardsToken].periodFinish) {
            rewardData[_rewardsToken].rewardRate = reward.div(rewardData[_rewardsToken].rewardsDuration);
        } else {
            uint256 remaining = rewardData[_rewardsToken].periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardData[_rewardsToken].rewardRate);
            rewardData[_rewardsToken].rewardRate = reward.add(leftover).div(
                rewardData[_rewardsToken].rewardsDuration
            );
        }

        rewardData[_rewardsToken].lastUpdateTime = block.timestamp;
        rewardData[_rewardsToken].periodFinish = block.timestamp.add(
            rewardData[_rewardsToken].rewardsDuration
        );

        emit RewardSent(reward);
        emit RewardTokenSnapshot(_rewardsToken, reward, rewardData[_rewardsToken].rewardsDuration);
    }

    function setRewardsDuration(address _rewardsToken, uint256 _rewardsDuration) external onlyOwner {
        require(block.timestamp > rewardData[_rewardsToken].periodFinish, 'Reward period still active');
        require(_rewardsDuration > 0, 'Reward duration must be non-zero');

        rewardData[_rewardsToken].rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(_rewardsToken, _rewardsDuration);
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        for (uint256 i; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            rewardData[token].rewardPerTokenStored = rewardPerToken(token);
            rewardData[token].lastUpdateTime = lastTimeRewardApplicable(token);
            if (account != address(0)) {
                rewards[account][token] = earned(account, token);
                userRewardPerTokenPaid[account][token] = rewardData[token].rewardPerTokenStored;
            }
        }
        _;
    }

    /* ========== HELPER FUNCTIONS ========== */

    function optimisticAssociation(address token) internal {
        (bool success, bytes memory result) = address(0x167).call(
            abi.encodeWithSignature('associateToken(address,address)', address(this), token)
        );
        require(success, 'HTS Precompile: CALL_EXCEPTION');
        int32 responseCode = abi.decode(result, (int32));
        // Success = 22; Non-HTS token (erc20) = 167
        require(responseCode == 22 || responseCode == 167, 'HTS Precompile: CALL_ERROR');
    }

    /* ========== EVENTS ========== */

    event RewardAdded(address rewardTokenAddress, uint256 rewardDuration);
    event RewardSent(uint256 reward);
    event RewardPaid(address indexed user, address indexed rewardsToken, uint256 reward);
    event RewardsDurationUpdated(address indexed campaignAddress, address token, uint256 newDuration);
    event Recovered(address token, uint256 amount);

    // emitted whenever a user interacts with the contract and changes his stake
    event AccountStakeSnapshot(address user, uint256 currentStake);
    event RewardTokenSnapshot(address rewardsTokenAddress, uint256 rewardsTokenSupply, uint256 remainingTotalDuration);
    event SupplySnapshot(uint256 totalSupply);
}
