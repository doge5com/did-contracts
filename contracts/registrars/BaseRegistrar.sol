// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '../controllers/Controllable.sol';
import '../interfaces/IRegistrar.sol';
import '../interfaces/IRegistry.sol';
import '../libraries/BytesUtil.sol';
import '../libraries/NameEncoder.sol';
import '../libraries/StringUtils.sol';

contract BaseRegistrar is IRegistrar, Controllable, ERC721Pausable, ERC721Enumerable {
    using Counters for Counters.Counter;
    using StringUtils for *;
    using NameEncoder for string;

    uint256 public constant GRACE_PERIOD = 90 days;

    string public baseTokenURI;

    uint8 public minNameStrLen;

    Counters.Counter public tokenIdTracker;
    // The registry
    IRegistry public registry;

    // The name of the TLD this registrar owns (eg, .eth)
    string private _tld;
    // Mapping from `labelId` to expiry times
    mapping(uint256 => uint256) private _expiries;
    // Mapping from `labelId` to `tokenId`
    mapping(uint256 => uint256) private _tokenIds;
    // Mapping from `tokenId` to 2LD name (label)
    mapping(uint256 => bytes) private _names;

    address private _issuer;
    address payable private _feeRecipient;
    address private _priceOracle;
    bytes32 private immutable _baseNode;

    constructor(
        IRegistry _registry,
        address priceOracle_,
        address payable feeRecipient_,
        string memory tld_,
        string memory _name,
        string memory _symbol
    ) ERC721(_name, _symbol) {
        registry = _registry;
        _tld = tld_;
        _feeRecipient = feeRecipient_;
        _priceOracle = priceOracle_;

        (, _baseNode) = address(this).toString().dnsEncodeName();
    }

    modifier live() {
        require(registry.owner(baseNode()) == address(this), 'BaseRegistrar: not live base node');
        _;
    }

    function tld() public view virtual override returns (string memory) {
        return _tld;
    }

    function baseNode() public view virtual override returns (bytes32) {
        return _baseNode;
    }

    function gracePeriod() public pure virtual override returns (uint256) {
        return GRACE_PERIOD;
    }

    function nameOf(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), 'BaseRegistrar: token does not exist');
        return string(_names[tokenId]);
    }

    function tokenOf(uint256 id) public view virtual override returns (uint256) {
        require(nameExpires(id) > 0, 'BaseRegistrar: id does not exist');
        return _tokenIds[id];
    }

    /**
     * @dev Gets the owner of the specified token ID. Names become unowned
     *      when their registration expires.
     * @param tokenId uint256 ID of the token to query the owner of
     * @return address currently marked as the owner of the given token ID
     */
    function ownerOf(uint256 tokenId) public view virtual override(IERC721, ERC721) returns (address) {
        require(_expiries[token2id(tokenId)] > block.timestamp, 'BaseRegistrar: token has expired');
        return super.ownerOf(tokenId);
    }

    function setBaseTokenURI(string memory _baseTokenURI) public onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    function setMinNameStrLen(uint8 min) public onlyOwner {
        minNameStrLen = min;
    }

    // Set the resolver for the TLD this registrar manages.
    function setResolver(address resolver) public virtual override onlyOwner {
        registry.setResolver(baseNode(), resolver);
    }

    // Returns the expiration timestamp of the specified id.
    function nameExpires(uint256 id) public view virtual override returns (uint256) {
        return _expiries[id];
    }

    // Returns true iff the specified name is available for registration.
    function available(uint256 id) public view virtual override returns (bool) {
        // Not available if it's registered here or in its grace period.
        return _expiries[id] + gracePeriod() < block.timestamp;
    }

    function issuer() public view virtual override returns (address) {
        return _issuer;
    }

    function setIssuer(address signer) external onlyOwner {
        _issuer = signer;
    }

    function feeRecipient() public view virtual override returns (address payable) {
        return _feeRecipient;
    }

    function setFeeRecipient(address payable recipient) external onlyOwner {
        _feeRecipient = recipient;
    }

    function priceOracle() public view virtual override returns (address) {
        return _priceOracle;
    }

    function setPriceOracle(address oracle) external onlyOwner {
        _priceOracle = oracle;
    }

    /**
     * @dev Register a name.
     * @param owner The address that should own the registration.
     * @param duration Duration in seconds for the registration.
     */
    function register(
        string calldata name,
        address owner,
        uint256 duration,
        address resolver
    ) public virtual override returns (uint256, uint256) {
        return _register(name, name2id(name), owner, duration, resolver);
    }

    /**
     * @dev Returns the next token ID to be minted.
     */
    function nextTokenId() public view virtual override returns (uint256) {
        return tokenIdTracker.current() + 1;
    }

    function exists(uint256 tokenId) public view virtual override returns (bool) {
        return _exists(tokenId);
    }

    function mintOnly(address to, uint256 tokenId) public virtual live onlyController whenNotPaused {
        _safeMint(to, tokenId);
    }

    /**
     * @dev Register a name without mint token.
     * @param owner The address that should own the registration.
     * @param duration Duration in seconds for the registration.
     */
    function registerOnly(
        string calldata name,
        address owner,
        uint256 duration,
        address resolver,
        uint256 tokenId
    ) public virtual live onlyController whenNotPaused {
        uint256 id = name2id(name);
        require(available(id), 'BaseRegistrar: name is registered');
        require(name.strlen() >= minNameStrLen, 'BaseRegistrar: name too short');
        // Prevent future overflow
        require(
            block.timestamp + duration + gracePeriod() > block.timestamp + gracePeriod(),
            'BaseRegistrar: invalid duration'
        );

        if (nameExpires(id) > 0) {
            require(name2id(string(_names[tokenId])) == id, 'BaseRegistrar: name does not match');
        } else {
            _names[tokenId] = bytes(name);
            _tokenIds[id] = tokenId;
        }

        _expiries[id] = block.timestamp + duration;

        if (_exists(tokenId)) {
            // Name was previously owned, and expired
            address oldOwner = ERC721.ownerOf(tokenId);
            _transfer(oldOwner, owner, tokenId);
        } else {
            if (resolver != address(0)) {
                registry.setSubnodeResolverAndTTL(baseNode(), bytes32(id), resolver, 0);
            }
        }

        emit NameRegistered(tokenId, id, owner, block.timestamp + duration);
    }

    function _register(
        string calldata name,
        uint256 id,
        address owner,
        uint256 duration,
        address resolver
    ) internal live onlyController whenNotPaused returns (uint256, uint256) {
        require(available(id), 'BaseRegistrar: name is registered');
        require(name.strlen() >= minNameStrLen, 'BaseRegistrar: name too short');
        // Prevent future overflow
        require(
            block.timestamp + duration + gracePeriod() > block.timestamp + gracePeriod(),
            'BaseRegistrar: invalid duration'
        );

        uint256 tokenId;
        if (nameExpires(id) > 0) {
            tokenId = _tokenIds[id];
            require(name2id(string(_names[tokenId])) == id, 'BaseRegistrar: name does not match');
        } else {
            tokenIdTracker.increment();
            tokenId = tokenIdTracker.current();
            _names[tokenId] = bytes(name);
            _tokenIds[id] = tokenId;
        }

        _expiries[id] = block.timestamp + duration;

        if (_exists(tokenId)) {
            // Name was previously owned, and expired
            address oldOwner = ERC721.ownerOf(tokenId);
            _transfer(oldOwner, owner, tokenId);
        } else {
            _mint(owner, tokenId);

            if (resolver != address(0)) {
                registry.setSubnodeResolverAndTTL(baseNode(), bytes32(id), resolver, 0);
            }
        }

        emit NameRegistered(tokenId, id, owner, block.timestamp + duration);

        return (tokenId, block.timestamp + duration);
    }

    function renew(uint256 id, uint256 duration)
        public
        virtual
        override
        live
        onlyController
        returns (uint256, uint256)
    {
        // Name must be registered here or in grace period
        require(_expiries[id] + gracePeriod() >= block.timestamp, 'BaseRegistrar: grace period passed');
        // Prevent future overflow
        require(_expiries[id] + duration + gracePeriod() > duration + gracePeriod(), 'BaseRegistrar: invalid duration');

        _expiries[id] += duration;
        emit NameRenewed(_tokenIds[id], id, _expiries[id]);
        return (_tokenIds[id], _expiries[id]);
    }

    /**
     * @dev Reclaim ownership of a name, if you own it in the registrar.
     */
    function reclaim(uint256 id, address owner) public virtual override live {
        require(_isApprovedOrOwner(msg.sender, tokenOf(id)), 'BaseRegistrar: caller is not token owner nor approved');
        registry.setSubnodeOwner(baseNode(), bytes32(id), owner);
    }

    function name2id(string memory name) public pure returns (uint256) {
        return uint256(keccak256(bytes(name)));
    }

    function token2id(uint256 tokenId) public view returns (uint256) {
        return name2id(nameOf(tokenId));
    }

    function pause() public onlyOwner {
        Pausable._pause();
    }

    function unpause() public onlyOwner {
        Pausable._unpause();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return interfaceId == type(IRegistrar).interfaceId || super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseTokenURI;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721Enumerable, ERC721Pausable) {
        super._beforeTokenTransfer(from, to, tokenId);

        registry.setSubnodeOwner(baseNode(), bytes32(name2id(string(_names[tokenId]))), to);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view override returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender));
    }
}
