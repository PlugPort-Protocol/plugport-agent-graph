// Deploys MemoryAnchor to the chain at MONAD_RPC_URL from ANCHOR_PRIVATE_KEY
// (both read from the repo-root .env), then writes the address to
// ANCHOR_CONTRACT in that .env.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ContractFactory, JsonRpcProvider, Wallet, formatEther } from 'ethers';
import { compile } from './compile.mjs';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { MONAD_RPC_URL: rpcUrl, ANCHOR_PRIVATE_KEY: privateKey, EXPLORER_TX_URL: explorerTx } = process.env;
if (!rpcUrl || !privateKey) {
    console.error('Set MONAD_RPC_URL and ANCHOR_PRIVATE_KEY in .env first.');
    process.exit(1);
}

const { abi, bytecode } = compile();
const provider = new JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
const wallet = new Wallet(privateKey, provider);
const { chainId } = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);
console.log(`Chain ${chainId}, deployer ${wallet.address}, balance ${formatEther(balance)} MON`);
if (balance === 0n) {
    console.error('The deployer has no MON. Fund it from the faucet first.');
    process.exit(1);
}

const contract = await new ContractFactory(abi, bytecode, wallet).deploy();
const tx = contract.deploymentTransaction();
console.log(`Deploy tx ${tx.hash}${explorerTx ? ` (${explorerTx}${tx.hash})` : ''}`);
const receipt = await tx.wait();
if (!receipt || receipt.status !== 1) throw new Error('Deployment transaction failed');
const address = await contract.getAddress();

// Sanity check: code is there and the view function answers.
if ((await provider.getCode(address)) === '0x') throw new Error(`No code at ${address}`);
const zero = await contract.anchoredAt(`0x${'00'.repeat(32)}`);
if (zero !== 0n) throw new Error('Unexpected anchoredAt(0) on a fresh contract');
console.log(`MemoryAnchor deployed at ${address} (block ${receipt.blockNumber})`);

if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8');
    const line = `ANCHOR_CONTRACT=${address}`;
    writeFileSync(envPath, /^ANCHOR_CONTRACT=.*$/m.test(env) ? env.replace(/^ANCHOR_CONTRACT=.*$/m, line) : `${env.trimEnd()}\n${line}\n`);
    console.log('Saved ANCHOR_CONTRACT to .env');
}
