// @ts-nocheck
import hardhat from 'hardhat';
import { Contract } from '@hashgraph/hethers';

async function deployERC20(name: string, symbol: string): Contract {
	console.log(`Starting ERC20 deployment...`);

	const MockToken = await hardhat.hethers.getContractFactory("MockToken");
	const mockToken = await MockToken.deploy(name, symbol);
	await mockToken.deployed();
	console.log(`Mock Token Deployed At: ${mockToken.address}`);
	return mockToken;
}

module.exports = deployERC20;
