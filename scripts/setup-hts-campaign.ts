// @ts-nocheck
import hardhat from 'hardhat';

const deployCampaignFromFactory = require('./02-deploy-campaign');
const enableRewards = require('./03-enable-rewards');
const sendRewards = require('./04-send-reward');
const approveToken = require('./utils/approveToken');

export const addressToId = (tokenAddress: string) => {
  return hethers.utils.asAccountString(tokenAddress);
};

async function setupHTSCampaign(factory: string, token: string, reward: string, amount: string, duration: string) {
  const deployer = (await hardhat.hethers.getSigners())[0];

  const deployerId = hardhat.hethers.utils.asAccountString(deployer.address);
  const deployerPk = deployer.identity.privateKey;

  // 1. Deploy new Campaign
  const campaign = await deployCampaignFromFactory(factory, deployer.address, token);

  const campaignId = addressToId(campaign);
  const rewardId = addressToId(reward);

  // 2. Approve Reward
  await approveToken(deployerId, deployerPk, campaignId, rewardId, amount);
  console.log(`Approved Campaign contract ${campaign} for ${amount} of Reward`);

  // 4. Enable WHBAR Rewards
  await enableRewards(campaign, reward, duration, true);

  // 5. Send Rewards
  await sendRewards(campaign, reward, amount);
}

module.exports = setupHTSCampaign;
