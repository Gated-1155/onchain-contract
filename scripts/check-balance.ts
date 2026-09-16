import { network } from "hardhat";

const { ethers } = await network.getOrCreate({ network: "amoy" });
const [deployer] = await ethers.getSigners();

console.log("Deployer:", deployer.address);
const balance = await ethers.provider.getBalance(deployer.address);
console.log("Balance (wei):", balance.toString());
console.log("Balance (POL):", Number(balance) / 1e18);
