// Compiles MemoryAnchor.sol with solc-js and writes artifacts/MemoryAnchor.json
// (ABI + bytecode). Same approach as PlugPort's contracts/compile.ts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import solc from 'solc';

const here = dirname(fileURLToPath(import.meta.url));
const NAME = 'MemoryAnchor';

export function compile() {
    const fileName = `${NAME}.sol`;
    const input = {
        language: 'Solidity',
        sources: { [fileName]: { content: readFileSync(join(here, fileName), 'utf8') } },
        settings: {
            // Pinned: newer solc releases default to EVM versions Monad may not run yet.
            evmVersion: 'cancun',
            optimizer: { enabled: true, runs: 200 },
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
    for (const e of output.errors ?? []) console.error(e.formattedMessage ?? e.message);
    if (errors.length > 0) throw new Error(`Compiling ${fileName} failed with ${errors.length} error(s)`);

    const contract = output.contracts[fileName][NAME];
    const artifact = {
        contractName: NAME,
        compiler: solc.version(),
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
    };
    mkdirSync(join(here, 'artifacts'), { recursive: true });
    writeFileSync(join(here, 'artifacts', `${NAME}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
    return artifact;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const { bytecode, abi, compiler } = compile();
    console.log(`Compiled ${NAME} with solc ${compiler}: ${(bytecode.length - 2) / 2} bytes, ${abi.length} ABI entries`);
}
