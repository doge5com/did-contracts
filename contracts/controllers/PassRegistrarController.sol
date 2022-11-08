// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '../interfaces/IRegistrar.sol';
import '../libraries/StringUtils.sol';

interface IMintPass is IERC721 {
    function mintPassInfos(uint256 tokenId) external returns (string memory name, uint256 strlen);
}

contract PassRegistrarController is Ownable {
    using StringUtils for *;

    event PassSwap(address indexed caller, address pass, address registrar, uint256 tokenId, string name);

    event NameRegistered(
        address indexed registrar,
        bytes32 indexed labelId,
        string name,
        address owner,
        uint256 tokenId,
        uint256 cost,
        uint256 expires
    );

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant ONE_YEAR_DURATION = 31556952;

    address public defaultResolver;
    uint256 public maxSwap;
    mapping(address => address) public swapPair;

    constructor(uint256 max, address resolver) {
        maxSwap = max;
        defaultResolver = resolver;
    }

    function addSwapPair(address pass, address registrar) public onlyOwner {
        require(swapPair[pass] != registrar, 'PassRegistrarController: swap pair already exist');
        swapPair[pass] = registrar;
    }

    function setMaxSwap(uint256 max) public onlyOwner {
        maxSwap = max;
    }

    function setDefaultResolver(address resolver) public onlyOwner {
        require(resolver != address(0), 'PassRegistrarController: Resolver address must not be 0');
        defaultResolver = resolver;
    }

    function passSwap(address pass, uint256[] calldata tokenIds) public {
        address registrar = swapPair[pass];
        require(registrar != address(0), 'PassRegistrarController: invalid pass');
        require(tokenIds.length <= maxSwap, 'PassRegistrarController: exceeded max swap limit');

        IMintPass mp = IMintPass(pass);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(mp.ownerOf(tokenIds[i]) == msg.sender, 'PassRegistrarController: caller is not token owner');
            mp.safeTransferFrom(msg.sender, DEAD_ADDRESS, tokenIds[i]);
            (string memory name, ) = mp.mintPassInfos(tokenIds[i]);
            require(name.strlen() > 0, 'PassRegistrarController: invalid pass info');
            (uint256 tokenId, uint256 expires) = IRegistrar(registrar).register(
                name,
                msg.sender,
                ONE_YEAR_DURATION,
                defaultResolver
            );

            emit PassSwap(msg.sender, pass, registrar, tokenIds[i], name);

            emit NameRegistered(registrar, keccak256(bytes(name)), name, msg.sender, tokenId, 0, expires);
        }
    }
}
