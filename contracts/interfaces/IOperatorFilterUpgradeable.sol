// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

interface IOperatorFilterUpgradeable {
    function filterTransfer(address from) external view returns (bool);

    function filterApprove(address operator) external view returns (bool);
}
