import { expect } from "chai";
import { ethers } from "hardhat";
import { Kaboom } from "../typechain-types";

// Helper that mirrors the server: packed keccak256(mineLayout || mineCount || salt)
function computeCommitment(mineLayout: number, mineCount: number, salt: `0x${string}`): `0x${string}` {
  return ethers.keccak256(ethers.solidityPacked(
    ["uint16", "uint8", "bytes32"],
    [mineLayout, mineCount, salt]
  )) as `0x${string}`;
}

describe("Kaboom", () => {
  async function deploy() {
    const [owner, house, player, stranger] = await ethers.getSigners();
    const K = await ethers.getContractFactory("Kaboom");
    // 2% edge, 2% maxBet, 50% maxPayout (the ceiling). Mines' worst-case
    // multipliers for 8+ mines are enormous (~10,000×+), so at low bets we
    // need the 50% payout cap to fit. In production, maxPayoutBps=1000 (10%)
    // is fine because the vault will be much larger relative to bets.
    const k = (await K.deploy(house.address, 200, 200, 5000)) as Kaboom;
    await owner.sendTransaction({ to: await k.getAddress(), value: ethers.parseEther("1000") });
    return { k, owner, house, player, stranger };
  }

  it("plays a full round: start → reveal safe ×3 → cashOut → settle", async () => {
    const { k, house, player } = await deploy();

    // 8 mines → 8 safe tiles → worst-case ~13× (fits under 10% vault cap easily).
    // Mines at bits 8..15, safe at 0..7.
    const mineLayout = 0b1111_1111_0000_0000;
    const mineCount = 8;
    const salt = ("0x" + "11".repeat(32)) as `0x${string}`;
    const commit = computeCommitment(mineLayout, mineCount, salt);

    const bet = ethers.parseEther("0.01");
    await k.connect(player).startGame(mineCount, commit, { value: bet });

    // Reveal safe tiles 0, 1, 2
    for (const tile of [0, 1, 2]) {
      const isMine = ((mineLayout >> tile) & 1) === 1;
      await k.connect(house).revealTile(player.address, tile, isMine);
    }

    const g = await k.games(player.address);
    expect(g.safeReveals).to.equal(3);
    expect(g.multiplierBps).to.be.gt(10_000n);

    const before = await ethers.provider.getBalance(player.address);
    const tx = await k.connect(player).cashOut();
    const rc = await tx.wait();
    const gasCost = rc!.gasUsed * rc!.gasPrice!;
    const after = await ethers.provider.getBalance(player.address);

    const payout = (bet * g.multiplierBps) / 10_000n;
    expect(after + gasCost - before).to.equal(payout);

    await expect(k.connect(house).settleGame(player.address, mineLayout, salt))
      .to.emit(k, "GameSettled");

    const v = await k.verifyGame(player.address);
    expect(v.ok).to.equal(true);
  });

  it("rejects settlement with a different mineLayout (commitment check)", async () => {
    const { k, house, player } = await deploy();
    const mineLayout = 0b1111_1111_0000_0000;
    const mineCount = 8;
    const salt = ("0x" + "22".repeat(32)) as `0x${string}`;
    const commit = computeCommitment(mineLayout, mineCount, salt);

    await k.connect(player).startGame(mineCount, commit, { value: ethers.parseEther("0.01") });
    await k.connect(house).revealTile(player.address, 0, false);
    await k.connect(player).cashOut();

    // Same popcount (still 8 mines) but different layout → commitment mismatch
    const tampered = 0b0111_1111_1000_0000;
    await expect(k.connect(house).settleGame(player.address, tampered, salt))
      .to.be.revertedWithCustomError(k, "CommitmentMismatch");
  });

  it("rejects settlement when a revealed-safe tile was actually a mine", async () => {
    const { k, house, player } = await deploy();

    // Layout says bit 0 is a mine, but server (falsely) reveals it as safe.
    const mineLayout = 0b0000_0000_0000_0001;
    const mineCount = 1;
    const salt = ("0x" + "33".repeat(32)) as `0x${string}`;
    const commit = computeCommitment(mineLayout, mineCount, salt);

    await k.connect(player).startGame(mineCount, commit, { value: ethers.parseEther("0.01") });
    await k.connect(house).revealTile(player.address, 0, false); // cheat
    await k.connect(player).cashOut();

    await expect(k.connect(house).settleGame(player.address, mineLayout, salt))
      .to.be.revertedWithCustomError(k, "RevealMismatch");
  });

  it("refunds after expiry if the server never settles", async () => {
    const { k, player } = await deploy();
    const mineLayout = 0b1111_1111_0000_0000;
    const salt = ("0x" + "44".repeat(32)) as `0x${string}`;
    const commit = computeCommitment(mineLayout, 8, salt);
    const bet = ethers.parseEther("0.01");

    await k.connect(player).startGame(8, commit, { value: bet });

    // Advance past GAME_EXPIRY_SECONDS (300s)
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);

    await expect(k.connect(player).refundExpired()).to.emit(k, "GameRefunded");
  });

  it("blocks double-start", async () => {
    const { k, player } = await deploy();
    const salt = ("0x" + "55".repeat(32)) as `0x${string}`;
    const commit = computeCommitment(0b1111_1111_0000_0000, 8, salt);
    await k.connect(player).startGame(8, commit, { value: ethers.parseEther("0.01") });
    await expect(k.connect(player).startGame(8, commit, { value: ethers.parseEther("0.01") }))
      .to.be.revertedWithCustomError(k, "GameActive");
  });

  it("only house can reveal / settle", async () => {
    const { k, stranger, player } = await deploy();
    const salt = ("0x" + "66".repeat(32)) as `0x${string}`;
    const commit = computeCommitment(0b1111_1111_0000_0000, 8, salt);
    await k.connect(player).startGame(8, commit, { value: ethers.parseEther("0.01") });
    await expect(k.connect(stranger).revealTile(player.address, 0, false))
      .to.be.revertedWithCustomError(k, "NotHouse");
  });
});
