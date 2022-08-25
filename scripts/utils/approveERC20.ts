// @ts-nocheck
import hardhat from 'hardhat';
import { getAddressFromAccount } from '@hashgraph/hethers/lib/utils';
import { Wallet } from 'ethers';

async function approve(tokenAddr, spenderAddr, amount, lenderAccount, lenderPK) {
  console.log(`Approving ${spenderAddr} to spent ${amount} of ${tokenAddr} token.`);


  let token = await hardhat.hethers.getContractAt('contracts/MultiRewards.sol:IERC20', tokenAddr)
  const signers = await hardhat.hethers.getSigners();
  token = token.connect(signers[0]);
  const approval = await token.approve(spenderAddr, amount);
  const txReceipt = await approval.wait();

  console.log(`Approved: ${txReceipt.transactionHash}`)
}

module.exports = approve;
