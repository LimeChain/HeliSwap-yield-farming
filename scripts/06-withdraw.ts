// @ts-nocheck
import hardhat from 'hardhat';

async function withdraw(
  contractAddress: string,
  amount: number
) {
  const multiRewards = await hardhat.hethers.getContractAt('MultiRewards', contractAddress);

  console.log('⚙️ Withdrawing tokens...');
  await multiRewards.withdraw(amount);
  console.log('✅ Withdrew '+ amount+' tokens successfully');
}

module.exports = withdraw;
