// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '../interfaces/IRegistrar.sol';

contract RandomClaimController is Ownable, Pausable {
    using Strings for uint256;

    event NameClaimed(address indexed caller, address registrar, uint256 tokenId, string name);

    event NameRegistered(
        address indexed registrar,
        bytes32 indexed labelId,
        string name,
        address owner,
        uint256 tokenId,
        uint256 cost,
        uint256 expires
    );

    uint256 public constant ONE_YEAR_DURATION = 31556952;
    uint256 public constant TOKEN_LIMIT = 11110;

    address public immutable resolver;
    address public immutable registrar;
    uint256 public immutable startTokenId;

    bytes32 public whitelistHash;
    //// Random index assignment
    uint256 public nonce = 0;
    uint256[TOKEN_LIMIT] indices;
    mapping(address => bool) public claimed;

    constructor(
        address _registrar,
        address _resolver,
        uint256 _startId
    ) {
        registrar = _registrar;
        resolver = _resolver;
        startTokenId = _startId;
    }

    function setWLHash(bytes32 hash) external onlyOwner {
        whitelistHash = hash;
    }

    function pause() public onlyOwner {
        Pausable._pause();
    }

    function unpause() public onlyOwner {
        Pausable._unpause();
    }

    function claim(bytes32[] calldata proof) external whenNotPaused {
        require(tx.origin == msg.sender, 'only EOA');
        require(!claimed[msg.sender], 'already claimed');
        require(nonce < TOKEN_LIMIT, 'insufficient remaining');
        require(MerkleProof.verify(proof, whitelistHash, keccak256(abi.encodePacked(msg.sender))), 'invalid proof');

        claimed[msg.sender] = true;

        string memory name = randomIndex(
            uint256(keccak256(abi.encodePacked(nonce, msg.sender, block.difficulty, block.timestamp)))
        ).toString();
        (uint256 tokenId, uint256 expires) = IRegistrar(registrar).register(
            name,
            msg.sender,
            ONE_YEAR_DURATION,
            resolver
        );

        emit NameClaimed(msg.sender, registrar, tokenId, name);

        emit NameRegistered(registrar, keccak256(bytes(name)), name, msg.sender, tokenId, 0, expires);
    }

    function randomIndex(uint256 seed) internal returns (uint256) {
        uint256 totalSize = TOKEN_LIMIT - nonce;
        uint256 index = seed % totalSize;
        uint256 value = 0;
        if (indices[index] != 0) {
            value = indices[index];
        } else {
            value = index;
        }

        // Move last value to selected position
        if (indices[totalSize - 1] == 0) {
            // Array position not initialized, so use position
            indices[index] = totalSize - 1;
        } else {
            // Array position holds a value so use that
            indices[index] = indices[totalSize - 1];
        }
        nonce++;
        // Don't allow a zero index, start counting at startTokenId
        return value + startTokenId;
    }
}
