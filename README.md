# MiniUSDT

MiniUSDT is a compact ERC‑20 style token that I use to explore how modern stablecoins are wired.  
It keeps the surface area intentionally small, but still brings the guard rails you would expect
in production—pausing, mint/burn controls, blacklist enforcement, and hardened allowance helpers.

## Why this exists

- **Understand the moving parts** – I wanted a contract where every storage slot and modifier has a
  clear reason to exist.
- **Practice secure-by-default flows** – zero-address checks, allowance clamps, and blacklist gates
  are all included and unit tested.
- **Have a real testbed** – the repository ships with TypeScript tests that run on Hardhat + Viem so
  it is trivial to reproduce scenarios like compromised accounts or paused transfers.

## Features

- ✅ Standard ERC‑20 balance/transfer/allowance surface
- ✅ Owner-only `mint`, `burnFrom`, `pause/unPause`, `blackList/unBlackList`
- ✅ Blacklist modifier that guards every sensitive path (transfer, approve, allowance helpers)
- ✅ Increase/decrease allowance helpers that revert on underflow to prevent race conditions
- ✅ Custom errors for cheaper and clearer reverts
- ✅ Exhaustive test suite using Node’s built-in `node:test` runner, Hardhat Network, and Viem

## Stack

| Layer        | Tech                                     | Notes                                              |
| ------------ | ---------------------------------------- | -------------------------------------------------- |
| Smart contract | Solidity ^0.8.0                        | Single contract: `contracts/MiniUSDT.sol`          |
| Development  | Hardhat + TypeScript                     | Config lives in `hardhat.config.ts`                |
| Testing      | node:test + Viem wallet clients          | See `test/MiniUSDT.ts`                             |
| Tooling      | ESLint/TSConfig via the default Hardhat scaffold | Run scripts from `package.json`             |

## Project map

```
contracts/      MiniUSDT.sol (token logic)
test/           MiniUSDT.ts (full behavior coverage)
scripts/        Misc helper scripts (e.g. send-op-tx.ts)
hardhat.config.ts   Hardhat + Viem integration
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the test suite

```bash
npx hardhat test
```

The tests deploy a fresh MiniUSDT instance per case and cover:

- Metadata + initial supply
- Transfers, approvals, and allowance math
- `transferFrom` edge cases
- Pause/unpause behavior
- Minting/burning restrictions
- Blacklist enforcement on senders, receivers, and spenders

### 3. Deploy locally (optional)

Hardhat comes preconfigured with Viem, so you can spin up a node and deploy manually:

```bash
npx hardhat node
npx hardhat run --network localhost scripts/send-op-tx.ts
```

Or open the console and interact directly:

```bash
npx hardhat console --network localhost
```

Inside the console you can do:

```js
const MiniUSDT = await ethers.getContractFactory("MiniUSDT");
const token = await MiniUSDT.deploy("MiniUSDT", "mUSDT", 1_000_000n);
await token.waitForDeployment();
```

## Security notes

This repository is a learning sandbox. It is not audited, and the owner role has superpowers
that would require governance and multi-sig protections in a real deployment. Treat it as a
reference, not production-ready code.

## License

MIT – see the SPDX identifier at the top of `MiniUSDT.sol`.
