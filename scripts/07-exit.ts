// @ts-nocheck
import hardhat from 'hardhat';

async function exit(
  contractAddress: string,
) {
  const multiRewards = await hardhat.hethers.getContractAt('MultiRewards', contractAddress);

  console.log('⚙️ Exiting MultiRewards contract...');
  await multiRewards.exit();
  console.log('✅ Exited successfully');
}

module.exports = withdraw;
