// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MiniUSDT {
    // State variables
    string public name;
    string public symbol;
    uint256 public totalSupply;
    uint8 public decimals = 6;
    bool public isPaused = false;
    address public owner;

    // Data stores
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;
    mapping(address => bool) private blackUsers;

    // All events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event UserBlocked(address indexed user);
    event UserUnBlocked(address indexed user);
    event ContractPaused();
    event ContractUnPaused();

    // Errors defined here
    error ZeroAddress();
    error ZeroAmount();
    error NotEnoughBalance();
    error NotEnoughApproval();
    error OwnerOnly();
    error ContractHasPaused();
    error UserHasBlocked();

    // Modifier checkers
    modifier nonZeroAddress(address from) {
        if (address(0) == from) {
            revert ZeroAddress();
        }
        _;
    }

    modifier nonZeroAmount(uint256 amount) {
        if (amount == 0) {
            revert ZeroAmount();
        }
        _;
    }

    modifier ownerOnly() {
        if (msg.sender != owner) {
            revert OwnerOnly();
        }
        _;
    }

    modifier checkPause() {
        if (isPaused) {
            revert ContractHasPaused();
        }
        _;
    }

    modifier checkBlackUser(address user) {
        if (blackUsers[user] == true) {
            revert UserHasBlocked();
        }
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply
    ) {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        owner = msg.sender;
        balances[msg.sender] = _totalSupply;

        emit Transfer(address(0), msg.sender, _totalSupply);
    }

    // Owner methods
    function mint(
        address minter,
        uint256 amount
    )
        external
        ownerOnly
        checkBlackUser(minter)
        nonZeroAddress(minter)
        nonZeroAmount(amount)
        returns (uint256)
    {
        totalSupply += amount;
        balances[minter] += amount;

        emit Transfer(address(0), minter, amount);
        return totalSupply;
    }

    function burnFrom(
        address from,
        uint256 amount
    ) external nonZeroAddress(from) ownerOnly returns (uint256) {
        if (balances[from] < amount) {
            revert NotEnoughBalance();
        }

        totalSupply -= amount;
        balances[from] -= amount;

        emit Transfer(from, address(0), amount);
        return totalSupply;
    }

    function pause() external ownerOnly {
        isPaused = true;
        emit ContractPaused();
    }

    function unPause() external ownerOnly {
        isPaused = false;
        emit ContractUnPaused();
    }

    function blackList(address user) external ownerOnly {
        blackUsers[user] = true;
        emit UserBlocked(user);
    }

    function unBlackList(address user) external ownerOnly {
        blackUsers[user] = false;
        emit UserUnBlocked(user);
    }

    // Public methods
    function balanceOf(
        address user
    ) public view nonZeroAddress(user) returns (uint256) {
        return balances[user];
    }

    function transfer(
        address to,
        uint256 amount
    )
        public
        checkBlackUser(msg.sender)
        checkBlackUser(to)
        checkPause
        nonZeroAmount(amount)
        nonZeroAddress(to)
        returns (bool)
    {
        if (balances[msg.sender] < amount) {
            revert NotEnoughBalance();
        }

        balances[msg.sender] -= amount;
        balances[to] += amount;

        emit Transfer(msg.sender, to, amount);

        return true;
    }

    function approve(
        address spender,
        uint256 amount
    )
        public
        checkBlackUser(msg.sender)
        checkBlackUser(spender)
        checkPause
        nonZeroAddress(spender)
        returns (bool)
    {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);

        return true;
    }

    function increaseAllowance(
        address spender,
        uint256 amount
    )
        public
        checkBlackUser(msg.sender)
        checkBlackUser(spender)
        checkPause
        nonZeroAddress(spender)
        nonZeroAmount(amount)
        returns (bool)
    {
        allowances[msg.sender][spender] += amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function decreaseAllowance(
        address spender,
        uint256 amount
    )
        public
        checkBlackUser(msg.sender)
        checkBlackUser(spender)
        checkPause
        nonZeroAddress(spender)
        nonZeroAmount(amount)
        returns (bool)
    {
        allowances[msg.sender][spender] -= amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function allowance(
        address _owner,
        address spender
    )
        public
        view
        nonZeroAddress(_owner)
        nonZeroAddress(spender)
        returns (uint256)
    {
        return allowances[_owner][spender];
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        public
        checkBlackUser(msg.sender)
        checkBlackUser(from)
        checkBlackUser(to)
        checkPause
        nonZeroAddress(from)
        nonZeroAddress(to)
        nonZeroAmount(amount)
        returns (bool)
    {
        address spender = msg.sender;
        if (allowances[from][spender] < amount) {
            revert NotEnoughApproval();
        }

        if (balances[from] < amount) {
            revert NotEnoughBalance();
        }

        allowances[from][spender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;

        emit Transfer(from, to, amount);

        return true;
    }
}
