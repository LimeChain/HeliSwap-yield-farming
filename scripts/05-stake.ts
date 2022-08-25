// @ts-nocheck
import hardhat from 'hardhat';

async function stake(
  contractAddress: string,
  amount: number
) {
  const multiRewards = await hardhat.hethers.getContractAt('MultiRewards', contractAddress);

  console.log('⚙️ Staking tokens...');
  await multiRewards.stake(amount);
  console.log('✅ Staked '+ amount+' tokens successfully');
}

module.exports = stake;
