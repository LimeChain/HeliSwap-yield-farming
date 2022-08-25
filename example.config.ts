// @ts-nocheck
import {NetworksUserConfig} from 'hardhat/types';

export const networks: NetworksUserConfig = {
  // Use the three accounts created and logged by createAccounts script
  local: {
    consensusNodes: [
      {
        url: '127.0.0.1:50211',
        nodeId: '0.0.3'
      }
    ],
    mirrorNodeUrl: 'http://127.0.0.1:5551',
    chainId: 0,
    accounts: [
      {
        "account": '0.0.1002',
        "privateKey": '0x7f109a9e3b0d8ecfba9cc23a3614433ce0fa7ddcc80f2a8f10b222179a5a80d6'
      },
      {
        "account": '0.0.1003',
        "privateKey": '0x6ec1f2e7d126a74a1d2ff9e1c5d90b92378c725e506651ff8bb8616a5c724628'
      }
    ]
  },

  testnet: {
    consensusNodes: [
      {
        url: 'https://0.testnet.hedera.com',
        nodeId: '0.0.3'
      }
    ],
    mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
    chainId: 0,
    accounts: [
      // {
      // 	"account": '0.0.47795263',
      // 	"privateKey": '0x45c3e0f6296ed22b520159830664f0dc32ca87bc1dc32e506593c12e7fef6a29'
      // },
      {
      	"account":"0.0.47795264",
      	"privateKey": "0x981fda8cf4ac64adb31e387351729bfd3feef99ad127b83d31135a7c5b56371e"
      },
      // hashpack
      // { // test account 1
      // 	account: "0.0.47795298",
      // 	privateKey: "302e020100300506032b65700422042018237d3c8e604a9934ee7d61ab71f4fec012ea07f505d3c1bf43d8141f79cb32"
      // },
      // { // test account 2 - TODO use this account for testing
      //   account: "0.0.47832532",
      //   privateKey: "302e020100300506032b657004220420bde35921f331fedc76f52f6338e27d7f5f563d076f03845f5518527030c794d7"
      // }
    ]
  }
};
