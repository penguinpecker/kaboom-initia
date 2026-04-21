import { ethers } from "hardhat";
import { keccak256, encodePacked } from "viem";
import { expect } from "chai";

describe("Commitment parity", () => {
  it("viem encodePacked matches Solidity abi.encodePacked byte-for-byte", async () => {
    const layout = 65280;
    const mines  = 8;
    const salt   = ("0x" + "ab".repeat(32)) as `0x${string}`;

    const viemHash = keccak256(encodePacked(
      ["uint16", "uint8", "bytes32"],
      [layout, mines, salt]
    ));
    const solHash = ethers.solidityPackedKeccak256(
      ["uint16", "uint8", "bytes32"],
      [layout, mines, salt]
    );
    expect(viemHash).to.equal(solHash);
  });
});
