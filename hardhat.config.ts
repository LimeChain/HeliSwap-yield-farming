import '@nomicfoundation/hardhat-toolbox';
require('@hashgraph/hardhat-hethers');
import { task } from 'hardhat/config';
import * as config from './config';

task('deploy', 'Deploys an YF contract')
  .addParam('owner', 'Campaign owner')
  .addParam('stakingtoken', 'Staking token address')
  .setAction(async taskArgs => {
    const { owner, stakingtoken } = taskArgs;

    const campaignDeployment = require('./scripts/01-deploy');

    await campaignDeployment(owner, stakingtoken);
  });

task('addReward', 'Add rewards to YF contract')
  .addParam('contractaddress', 'Campaign address')
  .addParam('rewardaddress', 'Reward address')
  .addParam('rewarddistributor', 'Distributor address')
  .addParam('rewardduration', 'Duration in seconds')
  .setAction(async taskArgs => {
    const { contractadress, rewardaddress, rewardsdistributor, rewardduration } = taskArgs;

    const addRewards = require('./scripts/02-addRewards');

    await addRewards(contractadress, rewardaddress, rewardsdistributor, rewardduration);
  });

task('sendReward', 'Send rewards to YF contract')
  .addParam('contractaddress', 'Campaign address')
  .addParam('rewardaddress', 'Reward address')
  .addParam('rewardamount', 'Reward amount')
  .addParam('rewarddecimals', 'Reward amount')

  .setAction(async taskArgs => {
    const { contractaddress, rewardaddress, rewardamount, rewarddecimals } = taskArgs;

    const sendRewards = require('./scripts/03-sendRewards');

    await sendRewards(contractaddress, rewardaddress, rewardamount, rewarddecimals);
  });

task('associateToken', 'Associates an HTS token')
  .addParam('accountid', 'The account that will be associated')
  .addParam('pk', 'The PK of the account that will be associated')
  .addParam('tokenid', 'The token that will is getting associated to')
  .setAction(async taskArgs => {
    console.log(taskArgs);
    const tokenAssociation = require('./scripts/utils/associateTokens');
    await tokenAssociation(taskArgs.accountid, taskArgs.pk, taskArgs.tokenid);
  });

task('approveToken', 'Approves an HTS token for spending by an account')
  .addParam('accountid', 'The account that will give permission')
  .addParam('pk', 'The PK of the account that will permit')
  .addParam('spenderaccountid', 'The account that will be permitted to spend tokens')
  .addParam('tokenid', 'The token will be spent')
  .addParam('amount', 'How many tokens will be spent')
  .setAction(async taskArgs => {
    console.log(taskArgs);
    const tokenApproval = require('./scripts/utils/approveToken');
    await tokenApproval(
      taskArgs.accountid,
      taskArgs.pk,
      taskArgs.spenderaccountid,
      taskArgs.tokenid,
      taskArgs.amount,
    );
  });

module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.5.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: 'testnet',
  hedera: {
    networks: config.networks,
    gasLimit: 2_000_000,
  },
};

export default config;
