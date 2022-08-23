// @ts-nocheck
import hardhat from 'hardhat';

async function deployFactory(): Contract {
  const MultiRewardsFactory = await hardhat.hethers.getContractFactory('MultiRewardsFactory');

  console.log('⚙️ Deploying factory contract...');
  const multiRewardsFactory = await MultiRewardsFactory.deploy();

  await multiRewardsFactory.deployed();

  console.log('✅ MultiRewards factory contract deployed to:', multiRewardsFactory.address);
  return multiRewardsFactory;
}

module.exports = deployFactory;
