// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockLPToken is ERC20 {

    constructor() ERC20("MockLP", "MOCK-LP") {}

    function mint(address _account, uint256 _amount) public {
        super._mint(_account, _amount);
    }

}
