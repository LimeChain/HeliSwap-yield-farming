// @ts-nocheck
import hardhat from 'hardhat';
import { Contract } from '@hashgraph/hethers';

async function deploy(owner: string, tokenAddress: string): Contract {
  const MultiRewards = await hardhat.hethers.getContractFactory('MultiRewards');

  console.log('⚙️ Deploying contract...');
  const multiRewards = await MultiRewards.deploy(owner, tokenAddress);

  await multiRewards.deployed();

  console.log('✅ MultiRewards contract deployed to:', multiRewards.address);
  return multiRewards
}

module.exports = deploy;
