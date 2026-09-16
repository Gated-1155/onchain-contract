import { network } from "hardhat";

// Deploy locally (no real cost) just to measure actual gas used, then price
// that against Amoy's live gas price.
const local = await network.create();
const [deployer] = await local.ethers.getSigners();

const badge = await local.ethers.deployContract("BadgeToken", [
  deployer.address,
  deployer.address,
  deployer.address,
]);
const deployReceipt = await badge.deploymentTransaction()!.wait();
const deployGasUsed = deployReceipt!.gasUsed;
console.log(`Deployment gas used: ${deployGasUsed}`);

// Also measure one createBadgeType + one mint, since those will follow deploy.
const createTx = await badge.createBadgeType("https://example.com/badge-1.json", false);
const createReceipt = await createTx.wait();
console.log(`createBadgeType gas used: ${createReceipt!.gasUsed}`);

const mintTx = await badge.mint(deployer.address, 1n, 1n, "0x");
const mintReceipt = await mintTx.wait();
console.log(`mint gas used: ${mintReceipt!.gasUsed}`);

// Now price against Amoy's live gas price.
const { ethers: amoyEthers } = await network.getOrCreate({ network: "amoy" });
const { gasPrice } = await amoyEthers.provider.getFeeData();
console.log(`\nAmoy current gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} gwei)`);

function cost(gas: bigint) {
  const wei = gas * gasPrice!;
  return `${wei} wei = ${Number(wei) / 1e18} POL`;
}

console.log(`\nEstimated cost:`);
console.log(`  Deploy           : ${cost(deployGasUsed)}`);
console.log(`  createBadgeType  : ${cost(createReceipt!.gasUsed)}`);
console.log(`  mint             : ${cost(mintReceipt!.gasUsed)}`);
console.log(
  `  Deploy + 1 create + 1 mint : ${cost(deployGasUsed + createReceipt!.gasUsed + mintReceipt!.gasUsed)}`,
);
