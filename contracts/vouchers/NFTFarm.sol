// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import '../interfaces/IVoucher.sol';

contract NFTFarm is OwnableUpgradeable, IERC721ReceiverUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    enum RewardType {
        Token,
        NFT
    }

    struct Pool {
        address nftAddress;
        uint256 stakeCount;
        uint256 stakeTime;
        RewardType rewardType;
        address rewardAddress;
        uint256 rewardCountPer;
        address rewardAccount;
        uint256 maxStakeCount;
        uint256 extraReward;
        bool closed;
    }
    Pool[] public pool;

    mapping(address => uint256) public nftTokenIds;

    // pool id => user address => stake info list
    mapping(uint256 => mapping(address => Stake[])) public poolStakes;
    // user address => pool ids
    mapping(address => uint256[]) public userStakes;
    // pool id => reward token ids
    mapping(uint256 => uint256[]) public rewardIds;

    mapping(address => mapping(uint256 => address)) public staked;

    EnumerableSetUpgradeable.UintSet private _priority;

    uint256 public priorityId;

    struct Stake {
        uint256[] tokenIds;
        uint256 beginTime;
    }

    modifier validatePoolByPid(uint256 _pid) {
        require(_pid < pool.length, 'pool does not exist');
        _;
    }

    event AddPoolEvent(
        address indexed _nftAddress,
        uint256 _stakeCount,
        uint256 _stakeTime,
        RewardType _rewardType,
        address indexed _rewardAddress,
        uint256 _rewardCountPer,
        address _rewardAccount,
        uint256 _maxStakeCount,
        uint256 _extraReward
    );
    event AddNFTTokenIdEvent(address indexed _nftAddress, uint256 indexed _tokenId);
    event StakeEvent(address indexed _user, uint256 _pid, uint256 _sid, uint256[] _tokenIds);
    event ForceWithdrawEvent(
        address indexed _user,
        uint256 _pid,
        uint256 _sid,
        uint256 _beginTime,
        uint256[] _tokenIds
    );
    event HarvestTokenEvent(
        address indexed _user,
        uint256 _pid,
        uint256 _sid,
        uint256 _amount,
        uint256 _extraReward,
        uint256[] _tokenIds
    );
    event HarvestNFTEvent(
        address indexed _user,
        uint256 _pid,
        uint256 _sid,
        uint256 _beginTokenId,
        uint256 _endTokenId,
        uint256 _extraReward,
        uint256[] _tokenIds
    );
    event TransferNFTOwnership(address indexed _nftAddress, address indexed _newOwner);
    event NominateNFTPotentialOwner(address indexed _nftAddress, address indexed _newOwner);
    event AcceptNFTOwnership(address indexed _nftAddress);
    event UpdatePoolStatusEvent(uint256 indexed pid, bool closed);
    event UpdateNFTTokenId(address _nftAddress, uint256 _tokenId);

    function initialize() public initializer {
        OwnableUpgradeable.__Ownable_init();

        priorityId = 2;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function addPool(
        address _nftAddress,
        uint256 _stakeCount,
        uint256 _stakeTime,
        RewardType _rewardType,
        address _rewardAddress,
        uint256 _rewardCountPer,
        address _rewardAccount,
        uint256 _maxStakeCount,
        uint256 _extraReward,
        bool _close,
        uint256[] memory _ids
    ) external onlyOwner {
        uint256 pid = pool.length;
        pool.push(
            Pool({
                nftAddress: _nftAddress,
                stakeCount: _stakeCount,
                stakeTime: _stakeTime,
                rewardType: _rewardType,
                rewardAddress: _rewardAddress,
                rewardCountPer: _rewardCountPer,
                rewardAccount: _rewardAccount,
                maxStakeCount: _maxStakeCount,
                extraReward: _extraReward,
                closed: _close
            })
        );

        rewardIds[pid] = _ids;

        emit AddPoolEvent(
            _nftAddress,
            _stakeCount,
            _stakeTime,
            _rewardType,
            _rewardAddress,
            _rewardCountPer,
            _rewardAccount,
            _maxStakeCount,
            _extraReward
        );
    }

    function addNFTTokenId(address _nftAddress, uint256 _tokenId) external onlyOwner {
        nftTokenIds[_nftAddress] = _tokenId;
        emit AddNFTTokenIdEvent(_nftAddress, _tokenId);
    }

    function stake(uint256 _pid, uint256[] calldata _tokenIds) external validatePoolByPid(_pid) {
        require(tx.origin == msg.sender, 'only EOA');
        require(!pool[_pid].closed, 'pool is closed');

        require(_tokenIds.length > 0, 'no token id of NFT');
        require(
            pool[_pid].stakeCount > 0 && _tokenIds.length % pool[_pid].stakeCount == 0,
            'invalid count of NFT list'
        );
        pool[_pid].maxStakeCount = pool[_pid].maxStakeCount - _tokenIds.length;

        IERC721Upgradeable nft = IERC721Upgradeable(pool[_pid].nftAddress);
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            require(staked[pool[_pid].nftAddress][_tokenIds[i]] == address(0), 'already staked');
            if (_pid == priorityId) {
                require(isPriority(_tokenIds[i]), 'not priority');
            }

            staked[pool[_pid].nftAddress][_tokenIds[i]] = msg.sender;
            nft.safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
        }
        poolStakes[_pid][msg.sender].push(Stake({ tokenIds: _tokenIds, beginTime: block.timestamp }));
        userStakes[msg.sender].push(_pid);

        IVoucher rewardNFT = IVoucher(pool[_pid].rewardAddress);
        uint256 rewardCount = (pool[_pid].rewardCountPer * _tokenIds.length) / pool[_pid].stakeCount;

        for (uint256 i = 0; i < rewardIds[_pid].length; i++) {
            rewardNFT.mint(msg.sender, rewardIds[_pid][i], rewardCount, '');
        }

        emit StakeEvent(msg.sender, _pid, poolStakes[_pid][msg.sender].length - 1, _tokenIds);
    }

    function harvest(uint256 _pid, uint256 _sid) external validatePoolByPid(_pid) {
        require(tx.origin == msg.sender, 'only EOA');
        require(_sid < poolStakes[_pid][msg.sender].length, 'staking is not existed');
        require(
            block.timestamp >= poolStakes[_pid][msg.sender][_sid].beginTime + pool[_pid].stakeTime,
            'staking is not due'
        );

        IERC721Upgradeable nft = IERC721Upgradeable(pool[_pid].nftAddress);
        for (uint256 i = 0; i < poolStakes[_pid][msg.sender][_sid].tokenIds.length; i++) {
            nft.safeTransferFrom(address(this), msg.sender, poolStakes[_pid][msg.sender][_sid].tokenIds[i]);
        }

        emit HarvestNFTEvent(msg.sender, _pid, _sid, 0, 0, 0, poolStakes[_pid][msg.sender][_sid].tokenIds);

        _removeFromPoolStakeList(_pid, _sid);
        _removeFromUserStakeList(_sid);
    }

    function isPriority(uint256 tokenId) public view returns (bool) {
        return _priority.contains(tokenId);
    }

    function addPriority(uint256[] calldata tokenIds) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _priority.add(tokenIds[i]);
        }
    }

    function setPriorityPool(uint256 _pid) external onlyOwner {
        priorityId = _pid;
    }

    function getUserStakeHisCnt(uint256 _pid, address _userAddr) public view validatePoolByPid(_pid) returns (uint256) {
        return poolStakes[_pid][_userAddr].length;
    }

    function getUserStakeHis(address _userAddr) public view returns (uint256[] memory) {
        return userStakes[_userAddr];
    }

    function getUserStakeHisByPoolId(uint256 _pid, address _userAddr)
        public
        view
        validatePoolByPid(_pid)
        returns (Stake[] memory)
    {
        return poolStakes[_pid][_userAddr];
    }

    function getUserStakeHis(
        uint256 _pid,
        address _userAddr,
        uint256 _index,
        uint256 _time
    )
        public
        view
        validatePoolByPid(_pid)
        returns (
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        require(_index < poolStakes[_pid][_userAddr].length, 'staking is not existed');
        uint256 endTime = poolStakes[_pid][_userAddr][_index].beginTime + pool[_pid].stakeTime;
        bool isCompleted = false;
        if (_time >= endTime) {
            isCompleted = true;
        }
        return (
            poolStakes[_pid][_userAddr][_index].tokenIds.length,
            poolStakes[_pid][_userAddr][_index].beginTime,
            endTime,
            isCompleted
        );
    }

    function getPoolLength() public view returns (uint256) {
        return pool.length;
    }

    function updatePoolStatus(uint256 _pid, bool _closed) external onlyOwner validatePoolByPid(_pid) {
        pool[_pid].closed = _closed;

        emit UpdatePoolStatusEvent(_pid, _closed);
    }

    function updateStakeTime(uint256 _pid, uint256 _stakeTime) external onlyOwner validatePoolByPid(_pid) {
        pool[_pid].stakeTime = _stakeTime;
    }

    function updateMaxStakeCount(uint256 _pid, uint256 _maxStakeCount) external onlyOwner validatePoolByPid(_pid) {
        pool[_pid].maxStakeCount = _maxStakeCount;
    }

    function _removeFromPoolStakeList(uint256 _pid, uint256 _sid) internal {
        poolStakes[_pid][msg.sender][_sid] = poolStakes[_pid][msg.sender][poolStakes[_pid][msg.sender].length - 1];
        poolStakes[_pid][msg.sender].pop();
    }

    function _removeFromUserStakeList(uint256 _sid) internal {
        userStakes[msg.sender][_sid] = userStakes[msg.sender][userStakes[msg.sender].length - 1];
        userStakes[msg.sender].pop();
    }
}
