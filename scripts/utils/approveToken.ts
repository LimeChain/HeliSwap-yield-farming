import { Hashgraph } from '../../utils/hashgraph';
import hardhat from 'hardhat';
import { getAccountFromAddress } from '@hashgraph/hethers/lib/utils';

async function approveToken(
  accountid: string,
  pk: string,
  spenderAccountId: string,
  tokenid: string,
  amount: number,
) {
  const client = Hashgraph.clientFor(hardhat.network.name).setOperator(accountid, pk);
  const spender = getAccountFromAddress(spenderAccountId);
  // const token = getAccountFromAddress(tokenid);
  await Hashgraph.approveToken(client, pk, accountid, `${spender.shard}.${spender.realm}.${spender.num}`, tokenid, amount);

  console.log(
    `${accountid} approved ${amount} of HTS Token ${tokenid} to be spent by ${spenderAccountId}`,
  );
}

module.exports = approveToken;
