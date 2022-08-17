// @ts-nocheck
import hardhat from 'hardhat';
import { Contract } from '@hashgraph/hethers';

async function addRewards(
  contract: Contract,
  rewardsAddress: string,
  rewardsDistributor: string,
  rewardsDuration: number,
) {
  console.log('⚙️ Adding reward...');
  await contract.addReward(rewardsAddress, rewardsDistributor, rewardsDuration);
  console.log('✅ Reward added');
}

module.exports = addRewards;
