import hardhat from "hardhat";

import { toBN, rightPad, asciiToHex } from 'web3-utils';

import { BigNumber, Contract, hethers } from '@hashgraph/hethers';
import getAddress = hethers.utils.getAddress;
import {expect} from "chai";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
const deployMintERC20 = require('../../scripts/utils/deploy-mint-erc20');
const deployMultiRewards = require('../../scripts/01-deploy');
const addRewards = require('../../scripts/02-addRewards');

const {
  onlyGivenAddressCanInvoke,
  ensureOnlyExpectedMutativeFunctions
} = require('./helpers');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { artifacts } = require('hardhat');
const { currentTime, toUnit, fastForward } = require('../utils')();


describe('MultiRewards', function () {
  this.timeout(10_200_000);
  let accounts: any;

  let owner: SignerWithAddress,
    authority: SignerWithAddress,
    rewardEscrowAddress: SignerWithAddress,
    stakingAccount1: SignerWithAddress,
    mockRewardsDistributionAddress: SignerWithAddress,
    deployer: SignerWithAddress;

  // Synthetix is the rewardsToken
  let rewardsToken: Contract, anotherRewardsToken: Contract,
    stakingToken: Contract,
    externalRewardsToken: Contract,
    multiRewards: Contract,
    rewardsDistribution: Contract;

  const DAY = 86400;
  const ZERO_BN = toBN(0);

  // TODO: Figure this out
  // const setRewardsTokenExchangeRate = async ({ rateStaleDays } = { rateStaleDays: 7 }) => {
  //   const rewardsTokenIdentifier = await rewardsToken.symbol();
  //   const tokenKey = rightPad(asciiToHex(rewardsTokenIdentifier), 64);
  //
  //   await setupPriceAggregators(exchangeRates, owner, [tokenKey]);
  //   await updateAggregatorRates(exchangeRates, null, [tokenKey], [toUnit('2')]);
  //   assert.equal(await exchangeRates.rateIsStale(tokenKey), false);
  // };

  // TODO: Figure out how to replace snapshots. Maybe redeployment?
  // addSnapshotBeforeRestoreAfterEach();

  before(async () => {
    // @ts-ignore
    accounts = await hardhat.hethers.getSigners();

    [
      deployer,
      owner,
      mockRewardsDistributionAddress,
      authority,
      rewardEscrowAddress,
      stakingAccount1,
      // @ts-ignore
    ] = accounts

    stakingToken = await deployMintERC20(deployer.address, 10000, "Staking Token", "STKN");
    rewardsToken = await deployMintERC20(deployer.address, 10000, "External Rewards Token", "MOAR");
    anotherRewardsToken = await deployMintERC20(deployer.address, 10000, "External Rewards Token 2", "MOAR2");

    // TODO: Setup rewards distribution contract

    multiRewards = await deployMultiRewards(deployer.address, stakingToken.address)

    // TODO: Figure out parameters here
    await addRewards(multiRewards.address, rewardsToken.address, getAddress(mockRewardsDistributionAddress.address), 10000)
    await addRewards(multiRewards.address, anotherRewardsToken.address, getAddress(mockRewardsDistributionAddress.address), 10000)
  });

  xit('ensure only known functions are mutative', () => {
    ensureOnlyExpectedMutativeFunctions({
      abi: multiRewards.abi,
      ignoreParents: ['ReentrancyGuard', 'Owned'],
      expected: [
        'stake',
        'withdraw',
        'exit',
        'getReward',
        'notifyRewardAmount',
        'setPaused',
        'setRewardsDistribution',
        'setRewardsDuration',
        'recoverERC20',
      ],
    });
  });

  describe('Constructor & Settings', () => {
    it('should set rewards token on constructor', async () => {
      expect(await multiRewards.rewardTokens(0)).to.be.equal(getAddress(rewardsToken.address))
      expect(await multiRewards.rewardTokens(1)).to.be.equal(getAddress(anotherRewardsToken.address))
    });

    it('should staking token on constructor', async () => {
      expect(await multiRewards.stakingToken()).to.be.equal(getAddress(stakingToken.address))
    });

    it('should set owner on constructor', async () => {
      expect(await multiRewards.owner()).to.be.equal(getAddress(deployer.address))
    });
  });

  function expandTo18Decimals(n: number): BigNumber {
    return hethers.BigNumber.from(n).mul(hethers.BigNumber.from(10).pow(18))
  }

  describe('Function permissions', () => {
    // const rewardValue = expandTo18Decimals(1.0);
    const rewardValue = BigNumber.from(1);

    before(async () => {
      // @ts-ignore
      let deployerConnectedRewardsTokenContract = rewardsToken.connect(deployer)
      await deployerConnectedRewardsTokenContract.transfer(multiRewards.address, BigNumber.from(1));
    });

    it('only rewardsDistribution address can call notifyRewardAmount', async () => {
      const data = await multiRewards.rewardData(getAddress(rewardsToken.address));

      // @ts-ignore
      const distributorTokenConnectedContract = rewardsToken.connect(mockRewardsDistributionAddress);
      await distributorTokenConnectedContract.approve(multiRewards.address, hethers.constants.MaxUint256);

      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "notifyRewardAmount",
        args: [rewardsToken.address, rewardValue],
        address: mockRewardsDistributionAddress,
        accounts,
      });
    });

    xit('only owner address can call setRewardsDuration', async () => {
      await fastForward(DAY * 7);
      await onlyGivenAddressCanInvoke({
        fnc: multiRewards.setRewardsDuration,
        args: [getAddress(rewardsToken.address), 70],
        address: owner,
        accounts,
      });
    });

    it('only owner address can call setPaused', async () => {
      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "setPaused",
        args: [true],
        address: deployer,
        accounts,
      });
    });
  });

  xdescribe('Pausable', async () => {
    beforeEach(async () => {
      await multiRewards.setPaused(true, { from: owner });
    });
    it('should revert calling stake() when paused', async () => {
      const totalToStake = toUnit('100');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });

      await assert.revert(
        multiRewards.stake(totalToStake, { from: stakingAccount1 }),
        'This action cannot be performed while the contract is paused'
      );
    });
    it('should not revert calling stake() when unpaused', async () => {
      await multiRewards.setPaused(false, { from: owner });

      const totalToStake = toUnit('100');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });

      await multiRewards.stake(totalToStake, { from: stakingAccount1 });
    });
  });

  xdescribe('External Rewards Recovery', () => {
    const amount = toUnit('5000');
    beforeEach(async () => {
      // Send ERC20 to StakingRewards Contract
      await externalRewardsToken.transfer(multiRewards.address, amount, { from: owner });
      assert.bnEqual(await externalRewardsToken.balanceOf(multiRewards.address), amount);
    });
    it('only owner can call recoverERC20', async () => {
      await onlyGivenAddressCanInvoke({
        fnc: multiRewards.recoverERC20,
        args: [externalRewardsToken.address, amount],
        address: owner,
        accounts,
        reason: 'Only the contract owner may perform this action',
      });
    });
    it('should revert if recovering staking token', async () => {
      await assert.revert(
        multiRewards.recoverERC20(stakingToken.address, amount, {
          from: owner,
        }),
        'Cannot withdraw the staking token'
      );
    });
    it('should retrieve external token from StakingRewards and reduce contracts balance', async () => {
      await multiRewards.recoverERC20(externalRewardsToken.address, amount, {
        from: owner,
      });
      assert.bnEqual(await externalRewardsToken.balanceOf(multiRewards.address), ZERO_BN);
    });
    it('should retrieve external token from StakingRewards and increase owners balance', async () => {
      const ownerMOARBalanceBefore = await externalRewardsToken.balanceOf(owner);

      await multiRewards.recoverERC20(externalRewardsToken.address, amount, {
        from: owner,
      });

      const ownerMOARBalanceAfter = await externalRewardsToken.balanceOf(owner);
      assert.bnEqual(ownerMOARBalanceAfter.sub(ownerMOARBalanceBefore), amount);
    });
    it('should emit Recovered event', async () => {
      const transaction = await multiRewards.recoverERC20(externalRewardsToken.address, amount, {
        from: owner,
      });
      assert.eventEqual(transaction, 'Recovered', {
        token: externalRewardsToken.address,
        amount: amount,
      });
    });
  });

  xdescribe('lastTimeRewardApplicable()', () => {
    it('should return 0', async () => {
      assert.bnEqual(await multiRewards.lastTimeRewardApplicable(), ZERO_BN);
    });

    describe('when updated', () => {
      it('should equal current timestamp', async () => {
        await multiRewards.notifyRewardAmount(toUnit(1.0), {
          from: mockRewardsDistributionAddress,
        });

        const cur = await currentTime();
        const lastTimeReward = await multiRewards.lastTimeRewardApplicable();

        assert.equal(cur.toString(), lastTimeReward.toString());
      });
    });
  });

  xdescribe('rewardPerToken()', () => {
    it('should return 0', async () => {
      assert.bnEqual(await multiRewards.rewardPerToken(), ZERO_BN);
    });

    it('should be > 0', async () => {
      const totalToStake = toUnit('100');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      const totalSupply = await multiRewards.totalSupply();
      assert.bnGt(totalSupply, ZERO_BN);

      const rewardValue = toUnit(5000.0);
      await rewardsToken.transfer(multiRewards.address, rewardValue, { from: owner });
      await multiRewards.notifyRewardAmount(rewardValue, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY);

      const rewardPerToken = await multiRewards.rewardPerToken();
      assert.bnGt(rewardPerToken, ZERO_BN);
    });
  });

  xdescribe('stake()', () => {
    it('staking increases staking balance', async () => {
      const totalToStake = toUnit('100');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });

      const initialStakeBal = await multiRewards.balanceOf(stakingAccount1);
      const initialLpBal = await stakingToken.balanceOf(stakingAccount1);

      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      const postStakeBal = await multiRewards.balanceOf(stakingAccount1);
      const postLpBal = await stakingToken.balanceOf(stakingAccount1);

      assert.bnLt(postLpBal, initialLpBal);
      assert.bnGt(postStakeBal, initialStakeBal);
    });

    it('cannot stake 0', async () => {
      await assert.revert(multiRewards.stake('0'), 'Cannot stake 0');
    });
  });

  xdescribe('earned()', () => {
    it('should be 0 when not staking', async () => {
      assert.bnEqual(await multiRewards.earned(stakingAccount1), ZERO_BN);
    });

    it('should be > 0 when staking', async () => {
      const totalToStake = toUnit('100');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      const rewardValue = toUnit(5000.0);
      await rewardsToken.transfer(multiRewards.address, rewardValue, { from: owner });
      await multiRewards.notifyRewardAmount(rewardValue, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY);

      const earned = await multiRewards.earned(stakingAccount1);

      assert.bnGt(earned, ZERO_BN);
    });

    it('rewardRate should increase if new rewards come before DURATION ends', async () => {
      const totalToDistribute = toUnit('5000');

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      const rewardRateInitial = await multiRewards.rewardRate();

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      const rewardRateLater = await multiRewards.rewardRate();

      assert.bnGt(rewardRateInitial, ZERO_BN);
      assert.bnGt(rewardRateLater, rewardRateInitial);
    });

    it('rewards token balance should rollover after DURATION', async () => {
      const totalToStake = toUnit('100');
      const totalToDistribute = toUnit('5000');

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY * 7);
      const earnedFirst = await multiRewards.earned(stakingAccount1);

      // await setRewardsTokenExchangeRate();
      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY * 7);
      const earnedSecond = await multiRewards.earned(stakingAccount1);

      assert.bnEqual(earnedSecond, earnedFirst.add(earnedFirst));
    });
  });

  xdescribe('getReward()', () => {
    it('should increase rewards token balance', async () => {
      const totalToStake = toUnit('100');
      const totalToDistribute = toUnit('5000');

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY);

      const initialRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const initialEarnedBal = await multiRewards.earned(stakingAccount1);
      await multiRewards.getReward({ from: stakingAccount1 });
      const postRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const postEarnedBal = await multiRewards.earned(stakingAccount1);

      assert.bnLt(postEarnedBal, initialEarnedBal);
      assert.bnGt(postRewardBal, initialRewardBal);
    });
  });

  xdescribe('setRewardsDuration()', () => {
    const sevenDays = DAY * 7;
    const seventyDays = DAY * 70;
    it('should increase rewards duration before starting distribution', async () => {
      const defaultDuration = await multiRewards.rewardsDuration();
      assert.bnEqual(defaultDuration, sevenDays);

      await multiRewards.setRewardsDuration(seventyDays, { from: owner });
      const newDuration = await multiRewards.rewardsDuration();
      assert.bnEqual(newDuration, seventyDays);
    });
    it('should revert when setting setRewardsDuration before the period has finished', async () => {
      const totalToStake = toUnit('100');
      const totalToDistribute = toUnit('5000');

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY);

      await assert.revert(
        multiRewards.setRewardsDuration(seventyDays, { from: owner }),
        'Previous rewards period must be complete before changing the duration for the new period'
      );
    });
    it('should update when setting setRewardsDuration after the period has finished', async () => {
      const totalToStake = toUnit('100');
      const totalToDistribute = toUnit('5000');

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY * 8);

      const transaction = await multiRewards.setRewardsDuration(seventyDays, { from: owner });
      assert.eventEqual(transaction, 'RewardsDurationUpdated', {
        newDuration: seventyDays,
      });

      const newDuration = await multiRewards.rewardsDuration();
      assert.bnEqual(newDuration, seventyDays);

      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });
    });

    it('should update when setting setRewardsDuration after the period has finished', async () => {
      const totalToStake = toUnit('100');
      const totalToDistribute = toUnit('5000');

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY * 4);
      await multiRewards.getReward({ from: stakingAccount1 });
      await fastForward(DAY * 4);

      // New Rewards period much lower
      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      const transaction = await multiRewards.setRewardsDuration(seventyDays, { from: owner });
      assert.eventEqual(transaction, 'RewardsDurationUpdated', {
        newDuration: seventyDays,
      });

      const newDuration = await multiRewards.rewardsDuration();
      assert.bnEqual(newDuration, seventyDays);

      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY * 71);
      await multiRewards.getReward({ from: stakingAccount1 });
    });
  });

  xdescribe('getRewardForDuration()', () => {
    it('should increase rewards token balance', async () => {
      const totalToDistribute = toUnit('5000');
      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(totalToDistribute, {
        from: mockRewardsDistributionAddress,
      });

      const rewardForDuration = await multiRewards.getRewardForDuration();

      const duration = await multiRewards.rewardsDuration();
      const rewardRate = await multiRewards.rewardRate();

      assert.bnGt(rewardForDuration, ZERO_BN);
      assert.bnEqual(rewardForDuration, duration.mul(rewardRate));
    });
  });

  xdescribe('withdraw()', () => {
    it('cannot withdraw if nothing staked', async () => {
      await assert.revert(multiRewards.withdraw(toUnit('100')), 'SafeMath: subtraction overflow');
    });

    it('should increases lp token balance and decreases staking balance', async () => {
      const totalToStake = toUnit('100');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      const initialStakingTokenBal = await stakingToken.balanceOf(stakingAccount1);
      const initialStakeBal = await multiRewards.balanceOf(stakingAccount1);

      await multiRewards.withdraw(totalToStake, { from: stakingAccount1 });

      const postStakingTokenBal = await stakingToken.balanceOf(stakingAccount1);
      const postStakeBal = await multiRewards.balanceOf(stakingAccount1);

      assert.bnEqual(postStakeBal.add(toBN(totalToStake)), initialStakeBal);
      assert.bnEqual(initialStakingTokenBal.add(toBN(totalToStake)), postStakingTokenBal);
    });

    it('cannot withdraw 0', async () => {
      await assert.revert(multiRewards.withdraw('0'), 'Cannot withdraw 0');
    });
  });

  xdescribe('exit()', () => {
    it('should retrieve all earned and increase rewards bal', async () => {
      const totalToStake = toUnit('100');
      const totalToDistribute = toUnit('5000');

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await multiRewards.notifyRewardAmount(toUnit(5000.0), {
        from: mockRewardsDistributionAddress,
      });

      await fastForward(DAY);

      const initialRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const initialEarnedBal = await multiRewards.earned(stakingAccount1);
      await multiRewards.exit({ from: stakingAccount1 });
      const postRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const postEarnedBal = await multiRewards.earned(stakingAccount1);

      assert.bnLt(postEarnedBal, initialEarnedBal);
      assert.bnGt(postRewardBal, initialRewardBal);
      assert.bnEqual(postEarnedBal, ZERO_BN);
    });
  });

  // xdescribe('notifyRewardAmount()', () => {
  //   let localStakingRewards: Contract;
  //
  //   before(async () => {
  //     localStakingRewards = await setupContract({
  //       accounts,
  //       contract: 'StakingRewards',
  //       args: [owner, rewardsDistribution.address, rewardsToken.address, stakingToken.address],
  //     });
  //
  //     await localStakingRewards.setRewardsDistribution(mockRewardsDistributionAddress, {
  //       from: owner,
  //     });
  //   });
  //
  //   it('Reverts if the provided reward is greater than the balance.', async () => {
  //     const rewardValue = toUnit(1000);
  //     await rewardsToken.transfer(localStakingRewards.address, rewardValue, { from: owner });
  //     await assert.revert(
  //       localStakingRewards.notifyRewardAmount(rewardValue.add(toUnit(0.1)), {
  //         from: mockRewardsDistributionAddress,
  //       }),
  //       'Provided reward too high'
  //     );
  //   });
  //
  //   it('Reverts if the provided reward is greater than the balance, plus rolled-over balance.', async () => {
  //     const rewardValue = toUnit(1000);
  //     await rewardsToken.transfer(localStakingRewards.address, rewardValue, { from: owner });
  //     localStakingRewards.notifyRewardAmount(rewardValue, {
  //       from: mockRewardsDistributionAddress,
  //     });
  //     await rewardsToken.transfer(localStakingRewards.address, rewardValue, { from: owner });
  //     // Now take into account any leftover quantity.
  //     await assert.revert(
  //       localStakingRewards.notifyRewardAmount(rewardValue.add(toUnit(0.1)), {
  //         from: mockRewardsDistributionAddress,
  //       }),
  //       'Provided reward too high'
  //     );
  //   });
  // });

  xdescribe('Integration Tests', () => {
    before(async () => {
      // Set rewardDistribution address
      await multiRewards.setRewardsDistribution(rewardsDistribution.address, {
        from: owner,
      });
      assert.equal(await multiRewards.rewardsDistribution(), rewardsDistribution.address);

      // await setRewardsTokenExchangeRate();
    });

    it('stake and claim', async () => {
      // Transfer some LP Tokens to user
      const totalToStake = toUnit('500');
      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });

      // Stake LP Tokens
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      // Distribute some rewards
      const totalToDistribute = toUnit('35000');
      assert.equal(await rewardsDistribution.distributionsLength(), 0);
      await rewardsDistribution.addRewardDistribution(multiRewards.address, totalToDistribute, {
        from: owner,
      });
      assert.equal(await rewardsDistribution.distributionsLength(), 1);

      // Transfer Rewards to the RewardsDistribution contract address
      await rewardsToken.transfer(rewardsDistribution.address, totalToDistribute, { from: owner });

      // Distribute Rewards called from Synthetix contract as the authority to distribute
      await rewardsDistribution.distributeRewards(totalToDistribute, {
        from: authority,
      });

      // Period finish should be ~7 days from now
      const periodFinish = await multiRewards.periodFinish();
      const curTimestamp = await currentTime();
      assert.equal(parseInt(periodFinish.toString(), 10), curTimestamp + DAY * 7);

      // Reward duration is 7 days, so we'll
      // Fastforward time by 6 days to prevent expiration
      await fastForward(DAY * 6);

      // Reward rate and reward per token
      const rewardRate = await multiRewards.rewardRate();
      assert.bnGt(rewardRate, ZERO_BN);

      const rewardPerToken = await multiRewards.rewardPerToken();
      assert.bnGt(rewardPerToken, ZERO_BN);

      // Make sure we earned in proportion to reward per token
      const rewardRewardsEarned = await multiRewards.earned(stakingAccount1);
      assert.bnEqual(rewardRewardsEarned, rewardPerToken.mul(totalToStake).div(toUnit(1)));

      // Make sure after withdrawing, we still have the ~amount of rewardRewards
      // The two values will be a bit different as time has "passed"
      const initialWithdraw = toUnit('100');
      await multiRewards.withdraw(initialWithdraw, { from: stakingAccount1 });
      assert.bnEqual(initialWithdraw, await stakingToken.balanceOf(stakingAccount1));

      const rewardRewardsEarnedPostWithdraw = await multiRewards.earned(stakingAccount1);
      assert.bnClose(rewardRewardsEarned, rewardRewardsEarnedPostWithdraw, toUnit('0.1'));

      // Get rewards
      const initialRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      await multiRewards.getReward({ from: stakingAccount1 });
      const postRewardRewardBal = await rewardsToken.balanceOf(stakingAccount1);

      assert.bnGt(postRewardRewardBal, initialRewardBal);

      // Exit
      const preExitLPBal = await stakingToken.balanceOf(stakingAccount1);
      await multiRewards.exit({ from: stakingAccount1 });
      const postExitLPBal = await stakingToken.balanceOf(stakingAccount1);
      assert.bnGt(postExitLPBal, preExitLPBal);
    });
  });
});
