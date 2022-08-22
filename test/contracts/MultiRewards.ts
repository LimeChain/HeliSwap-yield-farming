import hardhat from "hardhat";

import { BigNumber, Contract, hethers } from '@hashgraph/hethers';
import getAddress = hethers.utils.getAddress;
import {expect} from "chai";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Utils } from '../../utils/utils';
import expandTo18Decimals = Utils.expandTo18Decimals;
const deployMintERC20 = require('../../scripts/utils/deploy-mint-erc20');
const deployMultiRewards = require('../../scripts/01-deploy');
const addRewards = require('../../scripts/addRewards-with-contract');

const { onlyGivenAddressCanInvoke } = require('./helpers');
const { assert } = require('./common');

function fastForward(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('MultiRewards', function () {
  this.timeout(10_200_000);
  let accounts: any;
  let connections = new Map<SignerWithAddress, Map<Contract, Contract>>();

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
    ownerMultiRewards: Contract;

  const tokenAmount = expandTo18Decimals(10000000)
  const DAY = 2000;
  const ZERO_BN = BigNumber.from(0);

  async function redeploy(accounts: SignerWithAddress[], tokens: Contract[], stakingToken: Contract, period: number) {
    multiRewards = await deployMultiRewards(getAddress(owner.address), stakingToken.address)

    // @ts-ignore
    ownerMultiRewards = multiRewards.connect(owner)

    await addRewards(ownerMultiRewards, rewardsToken.address, getAddress(mockRewardsDistributionAddress.address), DAY * period);
    await addRewards(ownerMultiRewards, anotherRewardsToken.address, getAddress(mockRewardsDistributionAddress.address), DAY * period)
  }

  async function reconnect(contracts: Contract[], accounts: SignerWithAddress[]) {
    connections = new Map<SignerWithAddress, Map<Contract, Contract>>();
    for (const contract of contracts) {
      for (const account of accounts) {
        const accountContracts = connections.get(account)
        if (!accountContracts) {
          // @ts-ignore
          const contractRels = new Map<Contract, Contract>()
          // @ts-ignore
          contractRels.set(contract, contract.connect(account))
          connections.set(account, contractRels)
          continue
        }
        // @ts-ignore
        accountContracts.set(contract, contract.connect(account))
      }
    }
  }

  function call(from: SignerWithAddress, contract: Contract) {
    // @ts-ignore
    const c = connections.get(from).get(contract);
    if (!c) {
      throw new Error("Contract not found")
    }
    return c
  }

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

    stakingToken = await deployMintERC20(owner.address, tokenAmount.toString(), "Staking Token", "STKN");

    rewardsToken = await deployMintERC20(owner.address, tokenAmount.toString(), 'Rewards Token', 'MOAR');
    anotherRewardsToken = await deployMintERC20(owner.address, tokenAmount.toString(), "Rewards Token 2", "MOAR2");
    externalRewardsToken = await deployMintERC20(owner.address, tokenAmount.toString(), "External Rewards Token", "EXTR");

    await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 10);
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
      expect(await multiRewards.owner()).to.be.equal(getAddress(owner.address))
    });
  });

  describe('Function permissions', () => {
    const rewardValue = BigNumber.from(1);

    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 5)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)

      // @ts-ignore
      let ownerConnectedRewardsTokenContract = rewardsToken.connect(owner)
      await ownerConnectedRewardsTokenContract.transfer(multiRewards.address, BigNumber.from(1));
      await ownerConnectedRewardsTokenContract.transfer(mockRewardsDistributionAddress.address, BigNumber.from(2))
    });

    it('only rewardsDistribution address can call notifyRewardAmount', async () => {
      const data = await multiRewards.rewardData(getAddress(rewardsToken.address));

      // @ts-ignore
      await call(mockRewardsDistributionAddress, rewardsToken).approve(multiRewards.address, hethers.constants.MaxUint256);

      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "notifyRewardAmount",
        args: [rewardsToken.address, rewardValue],
        address: mockRewardsDistributionAddress,
        accounts,
      });
    });

    it('only owner address can call setRewardsDuration', async () => {
      await fastForward(10 * DAY);
      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "setRewardsDuration",
        args: [getAddress(rewardsToken.address), 21],
        address: mockRewardsDistributionAddress,
        accounts,
      });
    });

    it('only owner address can call setPaused', async () => {
      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "setPaused",
        args: [true],
        address: owner,
        accounts,
      });

      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "setPaused",
        args: [false],
        address: owner,
        accounts,
      });
    });
  });

  describe('Pausable', async () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 2)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    beforeEach(async () => {
      await call(owner, multiRewards).setPaused(true);
    });
    it('should revert calling stake() when paused', async () => {
      const totalToStake = BigNumber.from(100);
      await call(owner, stakingToken).transfer(getAddress(stakingAccount1.address), totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);

      await assert.revert(
        call(stakingAccount1, multiRewards).stake(totalToStake)
      );
    });
    it('should not revert calling stake() when unpaused', async () => {
      await call(owner, multiRewards).setPaused(false);

      const totalToStake = BigNumber.from(100);
      await call(owner, stakingToken).transfer(stakingAccount1.address, totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);

      await call(stakingAccount1, multiRewards).stake(totalToStake);
    });
  });

  describe('External Rewards Recovery', () => {
    let transferMultiplier = 0;

    const amount = expandTo18Decimals(5000);
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 2)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    beforeEach(async () => {
      // Send ERC20 to StakingRewards Contract
      transferMultiplier++;
      await call(owner, externalRewardsToken).transfer(multiRewards.address, amount);
      // TODO: Figure this assertion out
      // expect(await externalRewardsToken.balanceOf(multiRewards.address)).to.be.eq(amount.mul(transferMultiplier));
    });
    it('only owner can call recoverERC20', async () => {
      await onlyGivenAddressCanInvoke({
        contract: multiRewards,
        fnc: "recoverERC20",
        args: [externalRewardsToken.address, amount],
        address: owner,
        accounts
      });
    });
    it('should revert if recovering staking token', async () => {
      await assert.revert(
        call(owner, multiRewards).recoverERC20(stakingToken.address, amount)
      );
    });
    it('should retrieve external token from StakingRewards and reduce contracts balance', async () => {
      const beforeBalance = await externalRewardsToken.balanceOf(multiRewards.address);
      await call(owner, multiRewards).recoverERC20(externalRewardsToken.address, amount);
      // TODO: assert properly the left amount
      const afterBalance = await externalRewardsToken.balanceOf(multiRewards.address);
      expect(afterBalance).to.be.eq(amount.mul(transferMultiplier).sub(amount));
    });
    it('should retrieve external token from StakingRewards and increase owners balance', async () => {
      const ownerMOARBalanceBefore = await externalRewardsToken.balanceOf(getAddress(owner.address));

      await call(owner, multiRewards).recoverERC20(externalRewardsToken.address, amount);

      const ownerMOARBalanceAfter = await externalRewardsToken.balanceOf(getAddress(owner.address));
      expect(ownerMOARBalanceAfter.sub(ownerMOARBalanceBefore)).to.be.eq(amount);
    });
    it('should emit Recovered event', async () => {
      const transaction = await call(owner, multiRewards).recoverERC20(externalRewardsToken.address, amount);
      // TODO: figure out eventEqual!
      // assert.eventEqual(transaction, 'Recovered', {
      //   token: externalRewardsToken.address,
      //   amount: amount,
      // });
    });
  });

  describe('lastTimeRewardApplicable()', () => {
    before(async () => {
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('should return 0', async () => {
      expect(await multiRewards.lastTimeRewardApplicable(getAddress(rewardsToken.address))).to.be.eq(BigNumber.from(0));
    });

    // TODO: Figure out dates and timing
    // describe('when updated', () => {
    //   it('should equal current timestamp', async () => {
    //     const now = Date.now()
    //     await distributorMultiRewards.notifyRewardAmount(expandTo18Decimals(1));
    //
    //     const lastTimeReward = await multiRewards.lastTimeRewardApplicable();
    //
    //     assert.true(now.toString(), lastTimeReward.toString());
    //   });
    // });
  });

  describe('rewardPerToken()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 5)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('should return 0', async () => {
      expect(await multiRewards.rewardPerToken(getAddress(rewardsToken.address))).to.be.eq(BigNumber.from(0))
    });

    it('should be > 0', async () => {
      const totalToStake = expandTo18Decimals(100);
      // @ts-ignore
      await call(owner, stakingToken).transfer(stakingAccount1.address, totalToStake);
      // @ts-ignore
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, hethers.constants.MaxUint256);
      // @ts-ignore
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      const totalSupply = await multiRewards.totalSupply();
      expect(totalSupply.gt(BigNumber.from(0))).to.be.true;

      const rewardValue = expandTo18Decimals(5000);
      await call(owner, rewardsToken).transfer(multiRewards.address, rewardValue);
      // @ts-ignore
      await call(mockRewardsDistributionAddress, rewardsToken).approve(multiRewards.address, hethers.constants.MaxUint256);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), rewardValue);

      await fastForward(DAY);

      const rewardPerToken = await multiRewards.rewardPerToken(getAddress(rewardsToken.address));
      expect(rewardPerToken.gt(BigNumber.from(0))).to.be.true;
    });
  });

  describe('stake()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 5)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('staking increases staking balance', async () => {
      const totalToStake = expandTo18Decimals(100);
      await call(owner, stakingToken).transfer(getAddress(stakingAccount1.address), totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);

      const initialStakeBal = await multiRewards.balanceOf(getAddress(stakingAccount1.address));
      const initialLpBal = await stakingToken.balanceOf(getAddress(stakingAccount1.address));

      await call(stakingAccount1, multiRewards).stake(totalToStake);

      const postStakeBal = await multiRewards.balanceOf(getAddress(stakingAccount1.address));
      const postLpBal = await stakingToken.balanceOf(getAddress(stakingAccount1.address));

      expect(postLpBal.lt(initialLpBal)).to.be.true;
      expect(postStakeBal.gt(initialStakeBal)).to.be.true;
    });

    it('cannot stake 0', async () => {
      await assert.revert(multiRewards.stake('0'));
    });
  });

  describe('earned()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 5)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('should be 0 when not staking', async () => {
      expect(await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address))).to.be.eq(ZERO_BN);
    });

    it('should be > 0 when staking', async () => {
      const totalToStake = expandTo18Decimals(100);
      await call(owner, stakingToken).transfer(getAddress(stakingAccount1.address), totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      const rewardValue = expandTo18Decimals(5000.0);
      await call(owner, rewardsToken).transfer(multiRewards.address, rewardValue);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), rewardValue);

      await fastForward(DAY);

      const earned = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));

      expect(earned.gt(ZERO_BN)).to.be.true;
    });

    it('rewardRate should increase if new rewards come before DURATION ends', async () => {
      const totalToDistribute = expandTo18Decimals(5000);

      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      const rd = await multiRewards.rewardData(getAddress(rewardsToken.address));
      const rewardRateInitial = rd.rewardRate;

      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      const rdLater = await multiRewards.rewardData(getAddress(rewardsToken.address));
      const rewardRateLater = rd.rewardRate;

      expect(rewardRateInitial.gt(ZERO_BN)).to.be.true;
      expect(rewardRateLater.gt(rewardRateInitial)).to.be.true;
    });

    it('rewards token balance should rollover after DURATION', async () => {
      const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

      await call(owner, stakingToken).transfer(getAddress(stakingAccount1.address), totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, hethers.constants.MaxUint256);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      await call(owner, rewardsToken).transfer(mockRewardsDistributionAddress.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, rewardsToken).approve(multiRewards.address, hethers.constants.MaxUint256);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      await fastForward(DAY * 7);
      const earnedFirst = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));

      // await setRewardsTokenExchangeRate();
      await call(owner, rewardsToken).transfer(mockRewardsDistributionAddress.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, rewardsToken).approve(multiRewards.address, hethers.constants.MaxUint256);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      await fastForward(DAY * 7);
      const earnedSecond = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));

      expect(earnedSecond).to.be.eq(earnedFirst.add(earnedFirst));
    });
  });

  describe('getReward()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 5)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('should increase rewards token balance', async () => {
      const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

      await call(owner, stakingToken).transfer(getAddress(stakingAccount1.address), totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      await fastForward(DAY);

      const initialRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const initialEarnedBal = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));
      await call(stakingAccount1, multiRewards).getReward();
      const postRewardBal = await rewardsToken.balanceOf(getAddress(stakingAccount1.address));
      const postEarnedBal = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));

      expect(postEarnedBal.lt(initialEarnedBal)).to.be.true;
      expect(postRewardBal.gt(initialRewardBal)).to.be.true;
    });
  });

  // The above are almost DONE
  describe('setRewardsDuration()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 7)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    const sevenDays = DAY * 7;
    const seventyDays = DAY * 70;
    it('should increase rewards duration before starting distribution', async () => {
      const rewardData = await multiRewards.rewardData(getAddress(rewardsToken.address))
      const defaultDuration = rewardData.rewardsDuration;
      expect(defaultDuration).to.be.eq(sevenDays);

      await call(owner, multiRewards).setRewardsDuration(getAddress(rewardsToken.address), seventyDays);
      const newRewardData = await multiRewards.rewardData(getAddress(rewardsToken.address))
      const newDuration = newRewardData.rewardsDuration;
      expect(newDuration).to.be.eq(seventyDays);
    });
    it('should revert when setting setRewardsDuration before the period has finished', async () => {
      const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

      await call(owner, stakingToken).transfer(stakingAccount1, totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      await fastForward(DAY);

      await assert.revert(
        call(owner, multiRewards).setRewardsDuration(getAddress(rewardsToken.address), seventyDays)
      );
    });
    it('should update when setting setRewardsDuration after the period has finished', async () => {
      const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

      await call(owner, stakingToken).transfer(stakingAccount1, totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      await call(owner, rewardsToken).transfer(mockRewardsDistributionAddress.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      await fastForward(DAY * 8);

      const transaction = await call(owner, multiRewards).setRewardsDuration(rewardsToken.address, seventyDays);
      // assert.eventEqual(transaction, 'RewardsDurationUpdated', {
      //   newDuration: seventyDays,
      // });

      const newRewardData = await multiRewards.rewardData(getAddress(rewardsToken.address))
      const newDuration = newRewardData.rewardsDuration;
      expect(newDuration).to.be.eq(seventyDays);

      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);
    });

    it('should update when setting setRewardsDuration after the period has finished', async () => {
      const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

      await stakingToken.transfer(stakingAccount1, totalToStake, { from: owner });
      await stakingToken.approve(multiRewards.address, totalToStake, { from: stakingAccount1 });
      await multiRewards.stake(totalToStake, { from: stakingAccount1 });

      await rewardsToken.transfer(multiRewards.address, totalToDistribute, { from: owner });
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(totalToDistribute);

      await fastForward(DAY * 4);
      await call(stakingAccount1, multiRewards).getReward(getAddress(rewardsToken.address));
      await fastForward(DAY * 4);

      // New Rewards period much lower
      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      const transaction = await call(owner, multiRewards).setRewardsDuration(getAddress(rewardsToken.address), seventyDays);
      // assert.eventEqual(transaction, 'RewardsDurationUpdated', {
      //   newDuration: seventyDays,
      // });

      const newRewardData = await multiRewards.rewardData(getAddress(rewardsToken.address))
      const newDuration = newRewardData.rewardsDuration;
      expect(newDuration).to.be.eq(seventyDays);

      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), totalToDistribute);

      await fastForward(DAY * 71);
      await call(stakingAccount1, multiRewards).getReward(getAddress(rewardsToken.address));
    });
  });

  describe('getRewardForDuration()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 2)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('should increase rewards token balance', async () => {
      const totalToDistribute = expandTo18Decimals(5000);
      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(totalToDistribute);

      const rewardForDuration = await multiRewards.getRewardForDuration(getAddress(rewardsToken.address));

      const newRewardData = await multiRewards.rewardData(getAddress(rewardsToken.address))
      const duration = newRewardData.rewardsDuration;
      const rewardRate = newRewardData.rewardRate;

      expect(rewardForDuration.gt(ZERO_BN)).to.be.true;
      expect(rewardForDuration).to.be.eq(duration.mul(rewardRate));
    });
  });

  describe('withdraw()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 2)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('cannot withdraw if nothing staked', async () => {
      await assert.revert(multiRewards.withdraw(expandTo18Decimals(100)));
    });

    it('should increases lp token balance and decreases staking balance', async () => {
      const totalToStake = expandTo18Decimals(100);
      await call(owner, stakingToken).transfer(stakingAccount1, totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      const initialStakingTokenBal = await stakingToken.balanceOf(stakingAccount1);
      const initialStakeBal = await multiRewards.balanceOf(stakingAccount1);

      await call(stakingAccount1, multiRewards).withdraw(totalToStake);

      const postStakingTokenBal = await stakingToken.balanceOf(stakingAccount1);
      const postStakeBal = await multiRewards.balanceOf(stakingAccount1);

      expect(postStakeBal.add(totalToStake)).to.be.eq(initialStakeBal);
      expect(initialStakingTokenBal.add(totalToStake)).to.be.eq(postStakingTokenBal);
    });

    it('cannot withdraw 0', async () => {
      await assert.revert(multiRewards.withdraw('0'));
    });
  });

  describe('exit()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 2)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)
    })

    it('should retrieve all earned and increase rewards bal', async () => {
      const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

      await call(owner, stakingToken).transfer(stakingAccount1, totalToStake);
      await call(stakingAccount1, stakingToken).approve(multiRewards.address, totalToStake);
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      await call(owner, rewardsToken).transfer(multiRewards.address, totalToDistribute);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(expandTo18Decimals(5000));

      await fastForward(DAY);

      const initialRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const initialEarnedBal = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));
      await call(stakingAccount1, multiRewards).exit();
      const postRewardBal = await rewardsToken.balanceOf(stakingAccount1);
      const postEarnedBal = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));

      expect(postEarnedBal.lt(initialEarnedBal)).to.be.true;
      expect(postRewardBal.gt(initialRewardBal)).to.be.true;
      expect(postEarnedBal).to.be.eq(ZERO_BN);
    });
  });

  describe('notifyRewardAmount()', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 2)
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)

      await call(owner, multiRewards).setRewardsDistributor(getAddress(rewardsToken.address), mockRewardsDistributionAddress);
    });

    it('Reverts if the provided reward is greater than the balance.', async () => {
      const rewardValue = expandTo18Decimals(1000);
      await call(owner, rewardsToken).transfer(multiRewards.address, rewardValue);
      await assert.revert(
        call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(rewardValue.add(expandTo18Decimals(1).div(10))));
    });

    it('Reverts if the provided reward is greater than the balance, plus rolled-over balance.', async () => {
      const rewardValue = expandTo18Decimals(1000);
      await call(owner, rewardsToken).transfer(multiRewards.address, rewardValue);
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(getAddress(rewardsToken.address), rewardValue);
      await call(owner, rewardsToken).transfer(multiRewards.address, rewardValue);
      // Now take into account any leftover quantity.
      await assert.revert(
        call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(rewardValue.add(expandTo18Decimals(1).div(10)))
      );
    });
  });

  // TODO: add another staking token to E2E test
  describe('Integration Tests', () => {
    before(async () => {
      await redeploy(accounts, [rewardsToken, anotherRewardsToken], stakingToken, 10);
      await reconnect([rewardsToken, anotherRewardsToken, stakingToken, externalRewardsToken, multiRewards], accounts)

      // Set rewardDistribution address
      await call(owner, multiRewards).setRewardsDistributor(getAddress(stakingToken.address), getAddress(mockRewardsDistributionAddress.address));
      const rewardData = await multiRewards.rewardData(getAddress(stakingToken.address))
      assert.equal(rewardData.rewardsDistributor, getAddress(mockRewardsDistributionAddress.address));
    });

    it('stake and claim', async () => {
      // Transfer some LP Tokens to user
      const totalToStake = BigNumber.from('500');
      console.log(`Give staking account [${getAddress(stakingAccount1.address)}] ${totalToStake.toString()} of ${getAddress(stakingToken.address)} tokens.`)
      await call(owner, stakingToken).transfer(getAddress(stakingAccount1.address), totalToStake);

      // Stake LP Tokens
      console.log(`Staking account [${getAddress(stakingAccount1.address)}] approves ${getAddress(multiRewards.address)} to transfer ${totalToStake.toString()} of ${getAddress(stakingToken.address)} tokens.`)
      await call(stakingAccount1, stakingToken).approve(getAddress(multiRewards.address), hethers.constants.MaxUint256);

      console.log(`Staking account [${getAddress(stakingAccount1.address)}] stakes ${totalToStake.toString()} of ${getAddress(stakingToken.address)} tokens to ${getAddress(multiRewards.address)}.`)
      await call(stakingAccount1, multiRewards).stake(totalToStake);

      // Distribute some rewards
      const totalToDistribute = BigNumber.from('35000');

      console.log(`Give distribution account [${getAddress(mockRewardsDistributionAddress.address)}] ${totalToDistribute.toString()} of ${getAddress(rewardsToken.address)} reward tokens.`)

      // Transfer Rewards to the RewardsDistribution contract address
      await call(owner, rewardsToken).transfer(getAddress(mockRewardsDistributionAddress.address), totalToDistribute);

      console.log(`Distribution account [${getAddress(mockRewardsDistributionAddress.address)}] approves ${getAddress(multiRewards.address)} to transfer ${totalToDistribute.toString()} of ${getAddress(rewardsToken.address)} reward tokens.`)
      await call(mockRewardsDistributionAddress, rewardsToken).approve(getAddress(multiRewards.address), totalToDistribute);

      console.log(`Distribution account [${getAddress(mockRewardsDistributionAddress.address)}] notifies reward amount ${totalToDistribute.toString()} of ${getAddress(rewardsToken.address)} rewards token.`)
      await call(mockRewardsDistributionAddress, multiRewards).notifyRewardAmount(rewardsToken.address, totalToDistribute);

      // Period finish should be ~10 days from now
      const rd = await multiRewards.rewardData(getAddress(rewardsToken.address));
      console.log(`Period finish for ${getAddress(rewardsToken.address)} token campaign is ${rd.periodFinish}`)

      console.log(`Wait 5 "days"`);
      await fastForward(5 * DAY);

      // Reward rate and reward per token
      const rewardData = await multiRewards.rewardData(getAddress(rewardsToken.address));
      const rewardRate = rewardData.rewardRate;
      console.log(`Reward rate is ${rewardRate}`);
      expect(rewardRate.gt(BigNumber.from('0'))).to.be.true

      const rewardPerToken = await multiRewards.rewardPerToken(getAddress(rewardsToken.address));
      console.log(`Reward per token is ${rewardPerToken}`);
      expect(rewardPerToken.gt(BigNumber.from('0'))).to.be.true

      // Make sure we earned in proportion to reward per token
      const rewardRewardsEarned = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));
      const expectedRewardsEarned = rewardPerToken.mul(totalToStake).div(expandTo18Decimals(1));
      console.log(`Actual rewards earned: ${rewardRewardsEarned}, expected: ${expectedRewardsEarned}`)
      expect(rewardRewardsEarned).to.be.equal(expectedRewardsEarned);

      // Make sure after withdrawing, we still have the ~amount of rewardRewards
      // The two values will be a bit different as time has "passed"
      const initialWithdraw = BigNumber.from(100);
      await call(stakingAccount1, multiRewards).withdraw(initialWithdraw);
      const stakingAccountBalance = await stakingToken.balanceOf(getAddress(stakingAccount1.address));

      console.log(`Initial withdraw: ${initialWithdraw}, expected staking account balance: ${stakingAccountBalance}`)
      expect(initialWithdraw).to.be.equal(stakingAccountBalance);

      const rewardRewardsEarnedPostWithdraw = await multiRewards.earned(getAddress(stakingAccount1.address), getAddress(rewardsToken.address));

      const variance = expandTo18Decimals(1).div(BigNumber.from(10))
      assert.ok(
        rewardRewardsEarned.gte(rewardRewardsEarnedPostWithdraw.sub(variance)),
        `${rewardRewardsEarned} !~= ${rewardRewardsEarnedPostWithdraw} (maxVariance ${variance}`
      );
      assert.ok(
        rewardRewardsEarned.lte(rewardRewardsEarnedPostWithdraw.add(variance)),
        `${rewardRewardsEarned} !~= ${rewardRewardsEarnedPostWithdraw} (maxVariance ${variance}`
      );

      // Get rewards
      const initialRewardBal = await rewardsToken.balanceOf(getAddress(stakingAccount1.address));
      await call(stakingAccount1, multiRewards).getReward();
      const postRewardRewardBal = await rewardsToken.balanceOf(getAddress(stakingAccount1.address));

      expect(postRewardRewardBal.gt(initialRewardBal)).to.be.true;

      // Exit
      const preExitLPBal = await stakingToken.balanceOf(stakingAccount1.address);
      await call(stakingAccount1, multiRewards).exit();
      const postExitLPBal = await stakingToken.balanceOf(stakingAccount1.address);
      expect(postExitLPBal.gt(preExitLPBal)).to.be.true;
    });
  });
});
