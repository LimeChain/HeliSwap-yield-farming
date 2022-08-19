import * as hethers from "@hashgraph/hethers";
import {expect} from "chai";
import {BigNumber} from "@hashgraph/hethers";

export namespace Utils {

	const TEN_MINUTES = 600_000;

	export const MAX_VALUE_HTS = hethers.BigNumber.from('9223372036854775807');

	export const MINIMUM_LIQUIDITY = hethers.BigNumber.from(10).pow(3)

	export function getExpiry() {
		return (new Date()).getTime() + TEN_MINUTES;
	}

	export async function expectRevert(tx: any) {
		try {
			await tx;
		} catch (e: any) {
			expect(e.code).to.be.oneOf(["CONTRACT_REVERT_EXECUTED", "CALL_EXCEPTION"]);
		}
	}

	export function expandTo18Decimals(n: number): BigNumber {
		return hethers.BigNumber.from(n).mul(hethers.BigNumber.from(10).pow(18))
	}

	export function expandTo8Decimals(n: number): BigNumber {
		return hethers.BigNumber.from(n).mul(hethers.BigNumber.from(10).pow(8))
	}

	export function expandTo13Decimals(n: number): BigNumber {
		return hethers.BigNumber.from(n).mul(hethers.BigNumber.from(10).pow(13))
	}

	export function reduceFrom8Decimals(n: BigNumber): BigNumber {
		return n.div(hethers.BigNumber.from(10).pow(8));
	}
}
