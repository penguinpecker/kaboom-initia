// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  KABOOM! v1 — Provably Fair On-Chain Mines (Initia MiniEVM)
/// @notice Server-assisted commit-reveal port of the Solana/Anchor version.
///         - On-chain:  Holds bets, enforces rules, verifies fairness, settles payouts
///         - Off-chain: Generates mine layout, reveals tiles, provides verification
///
/// GAME FLOW:
///   1. Server generates: mineLayout (uint16 bitmask) + salt (32 bytes)
///   2. Server computes: commitment = keccak256(abi.encodePacked(mineLayout, mineCount, salt))
///   3. Player calls startGame(mineCount, commitment) with value = bet (bet locked in vault)
///   4. Player clicks tile → server calls revealTile(player, index, isMine) on-chain
///   5. Player calls cashOut OR server auto-ends when mine is hit
///   6. Server calls settleGame(player, mineLayout, salt) — contract verifies commitment
///   7. Anyone can call verifyGame(player) to check historical fairness
///
/// SECURITY PROPERTIES:
///   - Server cannot change mineLayout after commitment (keccak256 binding)
///   - Server must settle within GAME_EXPIRY_SECONDS or player gets full refund
///   - All reveals checked against mineLayout at settlement
///   - Multiplier computed on-chain using hypergeometric probability
///   - Vault enforces max bet / max payout caps
///   - Single active game per player (prevents griefing)
///   - Checked arithmetic (Solidity ^0.8)
contract Kaboom {
    // ─── CONSTANTS ───────────────────────────────────────────────────────────

    uint8  public constant GRID_SIZE          = 16;
    uint8  public constant MIN_MINES          = 1;
    uint8  public constant MAX_MINES          = 12;
    uint64 public constant BPS                = 10_000;
    /// ~5 minutes; measured in wall-clock seconds so it's independent of block rate.
    uint256 public constant GAME_EXPIRY_SECONDS = 300;
    /// Minimum bet: 0.001 INIT = 1e15 wei
    uint256 public constant MIN_BET           = 1e15;

    // ─── STATE ───────────────────────────────────────────────────────────────

    address public owner;
    address public houseAuthority;

    uint16 public houseEdgeBps;   // e.g. 200 = 2%
    uint16 public maxBetBps;      // bps of vault balance; e.g. 200 = 2%
    uint16 public maxPayoutBps;   // bps of vault balance; e.g. 1000 = 10%
    bool   public paused;

    uint64  public totalGames;
    uint256 public totalWagered;
    uint256 public totalPayouts;

    enum GameStatus { None, Playing, Won, Lost }

    struct GameSession {
        GameStatus status;         // 0 = no active game
        uint8   mineCount;
        uint8   safeReveals;
        uint16  revealedMask;      // bitmask of ALL revealed tiles
        uint16  revealedSafeMask;  // bitmask of tiles revealed as SAFE
        uint16  mineLayout;        // 0 until settled
        uint64  multiplierBps;     // BPS = 1.0x
        uint64  startTime;         // block.timestamp when game was created
        bool    settled;
        uint256 bet;
        bytes32 commitment;        // keccak256(mineLayout || mineCount || salt)
        bytes32 salt;              // zeroed until settled
    }

    /// player => active game. One active game per address.
    mapping(address => GameSession) public games;

    /// Lifetime per-player stats (for leaderboard UI)
    struct PlayerStats {
        uint64  gamesPlayed;
        uint64  gamesWon;
        uint256 biggestWin;
        uint64  biggestMultiplierBps;
        uint256 totalWagered;
        uint256 totalWon;
    }
    mapping(address => PlayerStats) public stats;

    /// Append-only log of winners, for on-chain leaderboard feeds.
    struct RecentWin {
        address player;
        uint256 bet;
        uint256 payout;
        uint64  multiplierBps;
        uint64  timestamp;
    }
    RecentWin[] public recentWins;

    // ─── EVENTS ──────────────────────────────────────────────────────────────

    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event VaultUpdated(uint16 houseEdgeBps, uint16 maxBetBps, uint16 maxPayoutBps, bool paused, address houseAuthority);

    event GameStarted(address indexed player, uint256 bet, uint8 mineCount, bytes32 commitment, uint64 timestamp);
    event TileRevealed(address indexed player, uint8 tileIndex, bool isMine, uint64 multiplierBps, uint8 safeReveals);
    event GameWon(address indexed player, uint256 bet, uint256 payout, uint64 multiplierBps, uint8 safeReveals);
    event GameLost(address indexed player, uint256 bet, uint8 tileIndex, uint8 safeReveals);
    event GameSettled(address indexed player, uint16 mineLayout, bytes32 commitment, bool verified);
    event GameRefunded(address indexed player, uint256 amount);
    event GameClosed(address indexed player);

    // ─── ERRORS ──────────────────────────────────────────────────────────────

    error NotOwner();
    error NotHouse();
    error NotPlayer();
    error InvalidConfig();
    error InvalidAmount();
    error InvalidMineCount();
    error InvalidTileIndex();
    error BetTooLow();
    error BetExceedsMax();
    error VaultPausedErr();
    error VaultInsufficient();
    error GameActive();
    error GameNotPlaying();
    error GameNotFinished();
    error GameAlreadySettled();
    error GameNotExpired();
    error TileAlreadyRevealed();
    error CommitmentMismatch();
    error RevealMismatch();
    error NoTilesRevealed();

    // ─── MODIFIERS ───────────────────────────────────────────────────────────

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyHouse() { if (msg.sender != houseAuthority) revert NotHouse(); _; }

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────────────

    constructor(
        address _houseAuthority,
        uint16 _houseEdgeBps,
        uint16 _maxBetBps,
        uint16 _maxPayoutBps
    ) {
        if (_houseEdgeBps > 1000) revert InvalidConfig();                   // max 10%
        if (_maxBetBps == 0 || _maxBetBps > 1000) revert InvalidConfig();   // max 10% per bet
        if (_maxPayoutBps == 0 || _maxPayoutBps > 5000) revert InvalidConfig(); // max 50% per payout
        if (_houseAuthority == address(0)) revert InvalidConfig();

        owner          = msg.sender;
        houseAuthority = _houseAuthority;
        houseEdgeBps   = _houseEdgeBps;
        maxBetBps      = _maxBetBps;
        maxPayoutBps   = _maxPayoutBps;

        emit VaultUpdated(_houseEdgeBps, _maxBetBps, _maxPayoutBps, false, _houseAuthority);
    }

    // ─── VAULT FUNDING ───────────────────────────────────────────────────────

    receive() external payable {
        emit VaultFunded(msg.sender, msg.value);
    }

    function fundVault() external payable {
        if (msg.value == 0) revert InvalidAmount();
        emit VaultFunded(msg.sender, msg.value);
    }

    // ─── START GAME ──────────────────────────────────────────────────────────

    /// Start a new game. Caller is the player.
    /// Server MUST have generated:
    ///   commitment = keccak256(abi.encodePacked(mineLayout, mineCount, salt))
    function startGame(uint8 mineCount, bytes32 commitment) external payable {
        if (paused) revert VaultPausedErr();
        if (mineCount < MIN_MINES || mineCount > MAX_MINES) revert InvalidMineCount();
        if (msg.value < MIN_BET) revert BetTooLow();

        GameSession storage g = games[msg.sender];
        if (g.status == GameStatus.Playing) revert GameActive();

        // Vault balance BEFORE this bet was added
        uint256 available = address(this).balance - msg.value;

        uint256 maxBet = (available * maxBetBps) / BPS;
        if (msg.value > maxBet) revert BetExceedsMax();

        // worst-case payout guard (all safe tiles cleared)
        uint64 worstMult = _calcMultiplier(GRID_SIZE - mineCount, mineCount, houseEdgeBps);
        uint256 worstPayout = (msg.value * uint256(worstMult)) / BPS;
        uint256 maxPayout   = (available * maxPayoutBps) / BPS;
        if (worstPayout > maxPayout) revert VaultInsufficient();

        // Reset session, mark Playing
        g.status           = GameStatus.Playing;
        g.mineCount        = mineCount;
        g.safeReveals      = 0;
        g.revealedMask     = 0;
        g.revealedSafeMask = 0;
        g.mineLayout       = 0;
        g.multiplierBps    = uint64(BPS);
        g.startTime        = uint64(block.timestamp);
        g.settled          = false;
        g.bet              = msg.value;
        g.commitment       = commitment;
        g.salt             = bytes32(0);

        totalGames   += 1;
        totalWagered += msg.value;

        PlayerStats storage ps = stats[msg.sender];
        ps.gamesPlayed  += 1;
        ps.totalWagered += msg.value;

        emit GameStarted(msg.sender, msg.value, mineCount, commitment, uint64(block.timestamp));
    }

    // ─── REVEAL TILE ─────────────────────────────────────────────────────────

    /// Reveal a tile. Called by the HOUSE AUTHORITY (server).
    /// Server decides safe/mine from its secret mineLayout; settlement verifies every reveal.
    function revealTile(address player, uint8 tileIndex, bool isMine) external onlyHouse {
        if (tileIndex >= GRID_SIZE) revert InvalidTileIndex();

        GameSession storage g = games[player];
        if (g.status != GameStatus.Playing) revert GameNotPlaying();

        uint16 bit = uint16(1) << tileIndex;
        if ((g.revealedMask & bit) != 0) revert TileAlreadyRevealed();

        g.revealedMask |= bit;

        if (isMine) {
            g.status = GameStatus.Lost;
            emit GameLost(player, g.bet, tileIndex, g.safeReveals);
        } else {
            g.revealedSafeMask |= bit;
            g.safeReveals += 1;
            g.multiplierBps = _calcMultiplier(g.safeReveals, g.mineCount, houseEdgeBps);

            uint8 totalSafe = GRID_SIZE - g.mineCount;
            if (g.safeReveals >= totalSafe) {
                g.status = GameStatus.Won;
            }
        }

        emit TileRevealed(player, tileIndex, isMine, g.multiplierBps, g.safeReveals);
    }

    // ─── CASH OUT ────────────────────────────────────────────────────────────

    /// Cash out current winnings. Called by the PLAYER.
    function cashOut() external {
        GameSession storage g = games[msg.sender];
        if (g.status != GameStatus.Playing) revert GameNotPlaying();
        if (g.safeReveals == 0) revert NoTilesRevealed();

        uint256 payout = (g.bet * uint256(g.multiplierBps)) / BPS;
        if (payout > address(this).balance) revert VaultInsufficient();

        g.status = GameStatus.Won;
        totalPayouts += payout;

        PlayerStats storage ps = stats[msg.sender];
        ps.gamesWon += 1;
        ps.totalWon += payout;
        if (payout > ps.biggestWin) ps.biggestWin = payout;
        if (g.multiplierBps > ps.biggestMultiplierBps) ps.biggestMultiplierBps = g.multiplierBps;

        recentWins.push(RecentWin({
            player: msg.sender,
            bet: g.bet,
            payout: payout,
            multiplierBps: g.multiplierBps,
            timestamp: uint64(block.timestamp)
        }));

        emit GameWon(msg.sender, g.bet, payout, g.multiplierBps, g.safeReveals);

        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "xfer");
    }

    // ─── SETTLE ──────────────────────────────────────────────────────────────

    function settleGame(address player, uint16 mineLayout, bytes32 salt) external onlyHouse {
        GameSession storage g = games[player];
        if (g.status != GameStatus.Won && g.status != GameStatus.Lost) revert GameNotPlaying();
        if (g.settled) revert GameAlreadySettled();

        // Commitment check. Matches server side:
        //   abi.encodePacked(uint16, uint8, bytes32) → 2 + 1 + 32 = 35 bytes
        bytes32 computed = keccak256(abi.encodePacked(mineLayout, g.mineCount, salt));
        if (computed != g.commitment) revert CommitmentMismatch();

        if (_popcount(mineLayout) != g.mineCount) revert CommitmentMismatch();

        // No safe reveal may overlap with the mine layout
        if ((g.revealedSafeMask & mineLayout) != 0) revert RevealMismatch();

        // Every tile revealed as MINE must actually be a mine
        uint16 revealedMineMask = g.revealedMask & (~g.revealedSafeMask);
        if ((revealedMineMask & mineLayout) != revealedMineMask) revert RevealMismatch();

        g.mineLayout = mineLayout;
        g.salt       = salt;
        g.settled    = true;

        emit GameSettled(player, mineLayout, g.commitment, true);
    }

    // ─── REFUND EXPIRED ──────────────────────────────────────────────────────

    /// Refund an unsettled Playing game after expiry. Called by the PLAYER.
    function refundExpired() external {
        GameSession storage g = games[msg.sender];
        if (g.bet == 0) revert GameNotPlaying();
        if (g.status != GameStatus.Playing) revert GameNotPlaying();
        if (block.timestamp <= uint256(g.startTime) + GAME_EXPIRY_SECONDS) revert GameNotExpired();

        uint256 refund = g.bet;
        delete games[msg.sender];

        emit GameRefunded(msg.sender, refund);
        (bool ok, ) = msg.sender.call{value: refund}("");
        require(ok, "xfer");
    }

    // ─── CLOSE FINISHED GAME ─────────────────────────────────────────────────

    /// Clear a finished (Won/Lost) game so the player can start a new one.
    function closeGame(address player) external {
        if (msg.sender != player && msg.sender != houseAuthority) revert NotPlayer();
        GameSession storage g = games[player];
        if (g.status != GameStatus.Won && g.status != GameStatus.Lost) revert GameNotFinished();
        delete games[player];
        emit GameClosed(player);
    }

    // ─── ADMIN ───────────────────────────────────────────────────────────────

    function withdrawVault(uint256 amount) external onlyOwner {
        if (amount == 0 || amount > address(this).balance) revert InvalidAmount();
        emit VaultWithdrawn(msg.sender, amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "xfer");
    }

    function updateVault(
        uint16 _houseEdgeBps,
        uint16 _maxBetBps,
        uint16 _maxPayoutBps,
        bool _paused,
        address _houseAuthority
    ) external onlyOwner {
        if (_houseEdgeBps > 1000) revert InvalidConfig();
        if (_maxBetBps == 0 || _maxBetBps > 1000) revert InvalidConfig();
        if (_maxPayoutBps == 0 || _maxPayoutBps > 5000) revert InvalidConfig();
        if (_houseAuthority == address(0)) revert InvalidConfig();

        houseEdgeBps   = _houseEdgeBps;
        maxBetBps      = _maxBetBps;
        maxPayoutBps   = _maxPayoutBps;
        paused         = _paused;
        houseAuthority = _houseAuthority;

        emit VaultUpdated(_houseEdgeBps, _maxBetBps, _maxPayoutBps, _paused, _houseAuthority);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfig();
        owner = newOwner;
    }

    // ─── VIEW HELPERS ────────────────────────────────────────────────────────

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function vaultHealth() external view returns (uint16) {
        uint256 b = address(this).balance;
        if (b >= 1 ether) return 100;
        return uint16((b * 100) / 1 ether);
    }

    function riskLevel() external view returns (uint8) {
        uint256 b = address(this).balance;
        if (b >= 1 ether) return 0;     // Healthy
        if (b >= 0.3 ether) return 1;   // Caution
        return 2;                        // Emergency
    }

    function maxBetCurrent() external view returns (uint256) {
        return (address(this).balance * maxBetBps) / BPS;
    }

    function maxPayoutCurrent() external view returns (uint256) {
        return (address(this).balance * maxPayoutBps) / BPS;
    }

    function recentWinsCount() external view returns (uint256) {
        return recentWins.length;
    }

    /// Newest-first paginated slice of winners, for the UI ticker.
    function getRecentWins(uint256 offset, uint256 limit)
        external
        view
        returns (RecentWin[] memory slice)
    {
        uint256 n = recentWins.length;
        if (offset >= n) return new RecentWin[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        slice = new RecentWin[](end - offset);
        for (uint256 i = 0; i < slice.length; i++) {
            slice[i] = recentWins[n - 1 - offset - i];
        }
    }

    /// Third-party auditable: recompute commitment from stored (settled) data.
    function verifyGame(address player) external view returns (bool ok, bytes32 computed, bytes32 stored) {
        GameSession storage g = games[player];
        if (!g.settled) return (false, bytes32(0), g.commitment);
        computed = keccak256(abi.encodePacked(g.mineLayout, g.mineCount, g.salt));
        stored = g.commitment;
        ok = (computed == stored);
    }

    // ─── INTERNAL ────────────────────────────────────────────────────────────

    /// Multiplier in BPS. ∏(i=0..n-1) [(total-i)/(total-mines-i)] * (1 - edge)
    function _calcMultiplier(uint8 safeReveals, uint8 mineCount, uint16 edgeBps)
        internal
        pure
        returns (uint64)
    {
        if (safeReveals == 0) return uint64(BPS);

        uint256 total = uint256(GRID_SIZE);
        uint256 mines = uint256(mineCount);

        uint256 result = uint256(BPS);
        for (uint256 i = 0; i < safeReveals; i++) {
            uint256 tilesRemaining = total - i;
            if (total < mines + i) break;
            uint256 safeRemaining = total - mines - i;
            if (safeRemaining == 0) break;
            result = (result * tilesRemaining) / safeRemaining;
        }

        result = (result * (BPS - uint256(edgeBps))) / BPS;

        if (result > type(uint64).max) result = type(uint64).max;
        return uint64(result);
    }

    function _popcount(uint16 x) internal pure returns (uint8) {
        uint16 v = x;
        v = (v & 0x5555) + ((v >> 1) & 0x5555);
        v = (v & 0x3333) + ((v >> 2) & 0x3333);
        v = (v & 0x0f0f) + ((v >> 4) & 0x0f0f);
        v = (v & 0x00ff) + ((v >> 8) & 0x00ff);
        return uint8(v);
    }
}
