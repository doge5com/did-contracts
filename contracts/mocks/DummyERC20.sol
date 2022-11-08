// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract DummyERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 100000000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
