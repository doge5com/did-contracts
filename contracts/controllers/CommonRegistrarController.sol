// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import '../interfaces/ICommonRegistrarController.sol';
import '../interfaces/IRegistrar.sol';
import '../interfaces/IReverseRegistrar.sol';
import '../libraries/StringUtils.sol';

/**
 * @dev A common registrar controller for registering and renewing names at fixed cost, supporting multiple tlds.
 */
contract CommonRegistrarController is Ownable, ICommonRegistrarController {
    using Address for address;
    using SafeERC20 for IERC20;
    using StringUtils for *;

    address public constant NATIVE_TOKEN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    // 365.2425 days
    uint256 public constant MIN_REGISTRATION_DURATION = 31556952;

    // A commitment can only be revealed after the minimum commitment age.
    uint256 public immutable minCommitmentAge;
    // A commitment expires after the maximum commitment age.
    uint256 public immutable maxCommitmentAge;

    IRegistry public immutable registry;
    IReverseRegistrar public immutable reverseRegistrar;

    mapping(bytes32 => uint256) public commitments;

    constructor(
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        IRegistry _registry,
        IReverseRegistrar _reverseRegistrar
    ) {
        require(_maxCommitmentAge > _minCommitmentAge);
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;

        registry = _registry;
        reverseRegistrar = _reverseRegistrar;
    }

    function rentPrice(
        address registrar,
        string memory name,
        uint256 duration
    ) public view override returns (IPriceOracle.Price memory price) {
        bytes32 label = keccak256(bytes(name));

        IRegistrar r = IRegistrar(registrar);
        price = IPriceOracle(r.priceOracle()).price(name, r.nameExpires(uint256(label)), duration);
    }

    function valid(string memory name) public pure returns (bool) {
        if (name.strlen() < 3) {
            return false;
        }
        bytes memory bname = bytes(name);
        // zero width for /u200b /u200c /u200d and U+FEFF
        for (uint256 i; i < bname.length - 2; i++) {
            if (bytes1(bname[i]) == 0xe2 && bytes1(bname[i + 1]) == 0x80) {
                if (bytes1(bname[i + 2]) == 0x8b || bytes1(bname[i + 2]) == 0x8c || bytes1(bname[i + 2]) == 0x8d) {
                    return false;
                }
            } else if (bytes1(bname[i]) == 0xef) {
                if (bytes1(bname[i + 1]) == 0xbb && bytes1(bname[i + 2]) == 0xbf) return false;
            }
        }
        return true;
    }

    function available(address registrar, string memory name) public view override returns (bool) {
        bytes32 label = keccak256(bytes(name));
        return valid(name) && IRegistrar(registrar).available(uint256(label));
    }

    function nameExpires(address registrar, string memory name) public view override returns (uint256) {
        bytes32 label = keccak256(bytes(name));
        return IRegistrar(registrar).nameExpires(uint256(label));
    }

    function makeCommitment(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data
    ) public pure override returns (bytes32) {
        bytes32 label = keccak256(bytes(name));
        if (data.length > 0) {
            require(resolver != address(0), 'RegistrarController: Resolver is required when data is supplied');
        }
        return keccak256(abi.encode(label, owner, duration, resolver, data, secret));
    }

    function commit(bytes32 commitment) public override {
        require(commitments[commitment] + maxCommitmentAge < block.timestamp);
        commitments[commitment] = block.timestamp;
    }

    function register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        address registrar
    ) public payable override {
        _consumeCommitment(name, duration, makeCommitment(name, owner, duration, secret, resolver, data), registrar);

        IPriceOracle.Price memory price = rentPrice(registrar, name, duration);

        IRegistrar r = IRegistrar(registrar);
        _transferFee(r, price);

        uint256 tokenId;
        uint256 expires;
        (tokenId, expires) = r.register(name, owner, duration, resolver);

        _setRecords(resolver, keccak256(bytes(name)), data, r);

        // if (reverseRecord) {
        //    _setReverseRecord(name, resolver, msg.sender, registrar);
        // }

        emit NameRegistered(
            registrar,
            keccak256(bytes(name)),
            name,
            owner,
            tokenId,
            price.base + price.premium,
            expires
        );
    }

    function renew(
        address registrar,
        string calldata name,
        uint256 duration
    ) external payable override {
        bytes32 label = keccak256(bytes(name));
        IPriceOracle.Price memory price = rentPrice(registrar, name, duration);
        IRegistrar r = IRegistrar(registrar);

        _transferFee(r, price);

        uint256 tokenId;
        uint256 expires;
        (tokenId, expires) = r.renew(uint256(label), duration);

        emit NameRenewed(registrar, label, name, tokenId, price.base + price.premium, expires);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        Address.sendValue(to, amount);
    }

    function withdrawERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(ICommonRegistrarController).interfaceId;
    }

    /* Internal functions */

    function _consumeCommitment(
        string memory name,
        uint256 duration,
        bytes32 commitment,
        address registrar
    ) internal {
        // Require a valid commitment (is old enough and is committed)
        require(
            commitments[commitment] + minCommitmentAge <= block.timestamp,
            'RegistrarController: Commitment is not valid'
        );

        // If the commitment is too old, or the name is registered, stop
        require(
            commitments[commitment] + maxCommitmentAge > block.timestamp,
            'RegistrarController: Commitment has expired'
        );
        require(available(registrar, name), 'RegistrarController: Name is unavailable');

        delete (commitments[commitment]);

        require(duration >= MIN_REGISTRATION_DURATION);
    }

    function _setRecords(
        address resolver,
        bytes32 label,
        bytes[] calldata data,
        IRegistrar registrar
    ) internal {
        bytes32 nodehash = keccak256(abi.encodePacked(registrar.baseNode(), label));
        for (uint256 i = 0; i < data.length; i++) {
            // check first few bytes are namehash
            bytes32 txNamehash = bytes32(data[i][4:36]);
            require(
                txNamehash == nodehash,
                'RegistrarController: Namehash on record do not match the name being registered'
            );
            resolver.functionCall(data[i], 'RegistrarController: Failed to set Record');
        }
    }

    function _setReverseRecord(
        string memory name,
        address resolver,
        address owner,
        address registrar
    ) internal {
        reverseRegistrar.setNameForAddr(msg.sender, owner, resolver, string.concat(name, '.', registrar.toString()));
    }

    function _transferFee(IRegistrar registrar, IPriceOracle.Price memory price) internal {
        uint256 cost = price.base + price.premium;
        if (price.currency == NATIVE_TOKEN_ADDRESS) {
            require(msg.value >= cost, 'RegistrarController: Not enough funds provided');

            registrar.feeRecipient().transfer(cost);

            if (msg.value > cost) {
                payable(msg.sender).transfer(msg.value - cost);
            }
        } else {
            IERC20(price.currency).safeTransferFrom(msg.sender, registrar.feeRecipient(), cost);
        }
    }
}
