import { network } from "hardhat";
import type { BadgeToken } from "../types/ethers-contracts/index.js";

// BADGE_ADMIN_ADDRESS / BADGE_PAUSER_ADDRESS / BADGE_MINTER_ADDRESS are optional —
// unset ones default to the deployer's own address, since this project has no
// backend/relayer: the admin's own wallet signs mint/pause/admin txs directly.
function envAddressOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) return fallback;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} is set but is not a valid address: ${value}`);
  }
  return value;
}

// Metadata for badges A/B/C lives in this repo's own metadata/ directory
// (not the metadata-test repo erc-1155 points at) - resolves once this repo
// is made public, via raw.githubusercontent.com against the default branch.
// Registering these right after deploy skips the manual admin-panel step
// for the three badges every deployment needs anyway.
const KNOWN_BADGES = [
  { uri: "https://raw.githubusercontent.com/onchain-toy/onchain-contract/main/metadata/1.json", transferable: false },
  { uri: "https://raw.githubusercontent.com/onchain-toy/onchain-contract/main/metadata/2.json", transferable: false },
  { uri: "https://raw.githubusercontent.com/onchain-toy/onchain-contract/main/metadata/3.json", transferable: true },
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Amoy's public RPC has repeatedly proven flaky mid-session (this exact loop
// hit a one-off revert on an otherwise-valid call once already) - retry a
// few times with a short delay before giving up on a single badge, instead
// of failing the whole deploy run over a transient hiccup.
async function createBadgeTypeWithRetry(badge: BadgeToken, uri: string, transferable: boolean, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const tx = await badge.createBadgeType(uri, transferable);
      await tx.wait();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`  attempt ${attempt} failed, retrying in 3s...`);
      await sleep(3000);
    }
  }
}

async function main() {
  const { ethers } = await network.getOrCreate({ network: "amoy" });
  const [deployer] = await ethers.getSigners();

  const defaultAdmin = envAddressOrDefault("BADGE_ADMIN_ADDRESS", deployer.address);
  const pauser = envAddressOrDefault("BADGE_PAUSER_ADDRESS", deployer.address);
  const minter = envAddressOrDefault("BADGE_MINTER_ADDRESS", deployer.address);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Chain ID     : ${chainId}`);
  console.log(`Deployer     : ${deployer.address}`);
  console.log(`Balance      : ${Number(balance) / 1e18} POL`);
  console.log(`Admin        : ${defaultAdmin}`);
  console.log(`Pauser       : ${pauser}`);
  console.log(`Minter       : ${minter}`);

  const badge = await ethers.deployContract("BadgeToken", [defaultAdmin, pauser, minter]);
  const badgeAddress = await badge.getAddress();

  console.log(`\nBadgeToken deployed -> ${badgeAddress}`);

  // Only the deployer's own wallet is signing this script - it can only
  // register badge types if it actually holds DEFAULT_ADMIN_ROLE, i.e. no
  // custom BADGE_ADMIN_ADDRESS was set for this deployment.
  if (defaultAdmin.toLowerCase() === deployer.address.toLowerCase()) {
    console.log(`\nRegistering known badge types (A/B/C)...`);
    for (const { uri, transferable } of KNOWN_BADGES) {
      await createBadgeTypeWithRetry(badge, uri, transferable);
      console.log(`  registered: ${uri} (transferable=${transferable})`);
    }
  } else {
    console.log(
      `\nSkipping auto-registration of A/B/C: BADGE_ADMIN_ADDRESS differs from the deployer, ` +
        `so this script can't sign as admin. Register them manually from the admin panel instead.`,
    );
  }

  console.log(`\nVerify on Polygonscan:`);
  console.log(
    `  npx hardhat verify --network amoy ${badgeAddress} ${defaultAdmin} ${pauser} ${minter}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
