import { network } from "hardhat";

const { ethers } = await network.getOrCreate({ network: "amoy" });

const chainId = (await ethers.provider.getNetwork()).chainId;
const blockNumber = await ethers.provider.getBlockNumber();
console.log(chainId);
console.log(blockNumber);
