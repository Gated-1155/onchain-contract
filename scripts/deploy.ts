import { network } from "hardhat";

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
  console.log(`\nVerify on Polygonscan:`);
  console.log(
    `  npx hardhat verify --network amoy ${badgeAddress} ${defaultAdmin} ${pauser} ${minter}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
