// @ts-nocheck
import hardhat from 'hardhat';

async function deployMultiRewardsFromFactory(
  factoryAddress: string,
  owner: string,
  tokenAddress: string,
) {
  const MultiRewardsFactory = await hardhat.hethers.getContractAt(
    'MultiRewardsFactory',
    factoryAddress,
  );
  const signer = (await hardhat.hethers.getSigners())[0];
  console.log('⚙️ Deploying Multirewards contract ...');

  const multiRewardsContractDeploy = await MultiRewardsFactory.deploy(signer.address, tokenAddress);
  await multiRewardsContractDeploy.wait();

  const multiRewardsContractCount = await MultiRewardsFactory.getMultirewardsContractsCount();
  const multiRewardsContractCountNum = parseInt(multiRewardsContractCount);

  const newMultiRewardsContractAddress = await MultiRewardsFactory.multiRewardsArray(
    multiRewardsContractCountNum - 1,
  );
  console.log('✅ MultiRewards contract deployed to:', newMultiRewardsContractAddress);
}

module.exports = deployMultiRewardsFromFactory;
