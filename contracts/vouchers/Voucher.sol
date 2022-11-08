// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import '../libraries/StringUtils.sol';
import '../interfaces/IVoucher.sol';

contract Voucher is IVoucher, AccessControlEnumerableUpgradeable, PausableUpgradeable, ERC1155SupplyUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using StringsUpgradeable for uint256;
    using StringUtils for string;

    bytes32 public constant CREATOR_ROLE = keccak256('CREATOR_ROLE');
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
    bytes32 public constant BURNER_ROLE = keccak256('BURNER_ROLE');
    bytes32 public constant PAUSER_ROLE = keccak256('PAUSER_ROLE');
    bytes32 public constant TRANSFER_ROLE = keccak256('TRANSFER_ROLE');

    string private _name;
    string private _symbol;
    CountersUpgradeable.Counter public tokenIdTracker;

    mapping(uint256 => VoucherInfo) public vouchers;
    mapping(uint256 => EnumerableSetUpgradeable.AddressSet) private _registrars;

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory uri_
    ) public initializer {
        _pause();
        __ERC1155_init(uri_);

        _name = name_;
        _symbol = symbol_;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(CREATOR_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        _setupRole(BURNER_ROLE, msg.sender);
        _setupRole(PAUSER_ROLE, msg.sender);
        _setupRole(TRANSFER_ROLE, msg.sender);
    }

    function createVoucher(VoucherInfo memory info, address[] calldata registrars)
        public
        virtual
        override
        onlyRole(CREATOR_ROLE)
    {
        uint256 id = tokenIdTracker.current();
        tokenIdTracker.increment();

        vouchers[id] = info;
        EnumerableSetUpgradeable.AddressSet storage set = _registrars[id];
        for (uint256 i = 0; i < registrars.length; i++) {
            set.add(registrars[i]);
        }

        emit VoucherCreated(id, info.effect, info.vtype, info.discount, info.expiredAt, info.strlen);
    }

    function updateVoucher(uint256 id, VoucherInfo memory info) public onlyRole(CREATOR_ROLE) {
        vouchers[id] = info;
    }

    function addRegistrar(uint256 id, address registrar) public onlyRole(CREATOR_ROLE) {
        _registrars[id].add(registrar);
    }

    function removeRegistrar(uint256 id, address registrar) public onlyRole(CREATOR_ROLE) {
        _registrars[id].remove(registrar);
    }

    function voucherOf(uint256 id) public view virtual override returns (VoucherInfo memory, address[] memory) {
        require(exists(id), 'Vouchers: invalid voucher id');

        return (vouchers[id], _registrars[id].values());
    }

    function checkout(
        uint256 id,
        VoucherEffect effect,
        address registrar,
        string memory domainName,
        address, /*currency*/
        uint256 price
    ) public view virtual override returns (uint256) {
        require(exists(id), 'Vouchers: invalid voucher id');
        VoucherInfo storage info = vouchers[id];
        require(info.effect == VoucherEffect.General || info.effect == effect, 'Vouchers: voucher type not match');
        require(info.isAll || _registrars[id].contains(registrar), 'Vouchers: invalid registrar');
        require(info.isPermanent || info.expiredAt >= block.timestamp, 'Vouchers: expired');
        require(domainName.strlen() >= info.strlen, 'Vouchers: invalid character length');

        uint256 finalPrice = price;
        if (info.vtype == VoucherType.Discount) {
            finalPrice = (price * info.discount) / 100;
        } else if (info.vtype == VoucherType.Deduct) {
            if (info.discount >= price) {
                finalPrice = 0;
            } else {
                finalPrice = price - info.discount;
            }
        }
        return finalPrice;
    }

    function name() public view virtual returns (string memory) {
        return _name;
    }

    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    function totalSupply() public view virtual returns (uint256) {
        uint256 ts = 0;
        for (uint256 i = 0; i < tokenIdTracker.current(); i++) {
            ts += totalSupply(i);
        }
        return ts;
    }

    function exists(uint256 id) public view virtual override returns (bool) {
        return id < tokenIdTracker.current();
    }

    function uri(uint256 id) public view override returns (string memory) {
        require(exists(id), 'Vouchers: invalid voucher id');

        string memory baseURI = super.uri(id);
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, id.toString())) : '';
    }

    function balanceOf(address account) public view virtual returns (uint256) {
        uint256 amount = 0;
        for (uint256 i = 0; i < tokenIdTracker.current(); i++) {
            amount += balanceOf(account, i);
        }
        return amount;
    }

    function setBaseURI(string memory baseURI) public onlyRole(CREATOR_ROLE) {
        _setURI(baseURI);
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override onlyRole(MINTER_ROLE) {
        require(exists(id), 'Vouchers: invalid voucher id');

        _mint(to, id, amount, data);
    }

    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override onlyRole(MINTER_ROLE) {
        for (uint256 i = 0; i < ids.length; i++) {
            require(exists(ids[i]), 'Vouchers: invalid voucher id');
        }
        _mintBatch(to, ids, amounts, data);
    }

    function burn(
        address account,
        uint256 id,
        uint256 value
    ) public virtual override {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()) || hasRole(BURNER_ROLE, _msgSender()),
            'Vouchers: caller is not token owner nor approved'
        );

        _burn(account, id, value);
    }

    function burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory values
    ) public virtual override {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()) || hasRole(BURNER_ROLE, _msgSender()),
            'Vouchers: caller is not token owner nor approved'
        );

        _burnBatch(account, ids, values);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override(IERC1155Upgradeable, ERC1155Upgradeable) {
        require(!paused() || hasRole(TRANSFER_ROLE, _msgSender()), 'Vouchers: non transferable');

        super.safeTransferFrom(from, to, id, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override(IERC1155Upgradeable, ERC1155Upgradeable) {
        require(!paused() || hasRole(TRANSFER_ROLE, _msgSender()), 'Vouchers: non transferable');

        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }

    function pause() public virtual onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public virtual onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(IERC165Upgradeable, AccessControlEnumerableUpgradeable, ERC1155Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IVoucher).interfaceId || super.supportsInterface(interfaceId);
    }
}
