import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { network } from 'hardhat';
import { Address } from 'viem';

/**
 * Helper: expect a transaction to revert. Optionally match custom error name.
 * Note: error messages vary by versions; this is "best effort".
 */
async function expectRevert(fn: Function, expectedErrorName: string) {
  await assert.rejects(
    async () => {
      await fn();
    },
    (err: Error) => {
      if (!expectedErrorName) return true;
      const msg = String(err?.message ?? err);
      return msg.includes(expectedErrorName);
    }
  );
}

describe('MiniUSDT', async function () {
  const { viem } = await network.connect();

  // Deploys a fresh token for each test and returns pre-wired helpers for clarity
  async function deploy() {
    const initialSupply = 1_000_000n; // 1.000000 USDT (decimals=6)
    const token = await viem.deployContract('MiniUSDT', [
      'MiniUSDT',
      'mUSDT',
      initialSupply,
    ]);

    const [owner, user1, user2, spender] = await viem.getWalletClients();

    const tokenAsUser1 = await viem.getContractAt('MiniUSDT', token.address, {
      client: { wallet: user1 },
    });
    const tokenAsUser2 = await viem.getContractAt('MiniUSDT', token.address, {
      client: { wallet: user2 },
    });
    const tokenAsSpender = await viem.getContractAt('MiniUSDT', token.address, {
      client: { wallet: spender },
    });

    // ─────────────────────────────────────────────────────────────
    // Aliases
    // ─────────────────────────────────────────────────────────────
    const api = {
      // ERC20
      balanceOf: (addr: Address) => token.read.balanceOf([addr]),
      allowance: (a: Address, b: Address) => token.read.allowance([a, b]),
      transfer: (to: Address, amount: bigint) =>
        token.write.transfer([to, amount]),
      approve: (spenderAddr: Address, amount: bigint) =>
        token.write.approve([spenderAddr, amount]),
      transferFromAsSpender: (from: Address, to: Address, amount: bigint) =>
        tokenAsSpender.write.transferFrom([from, to, amount]),

      // Allowance safe patterns that map to increase/decrease helpers on the contract
      increaseAllowance: (spenderAddr: Address, added: bigint) =>
        token.write.increaseAllowance([spenderAddr, added]),
      decreaseAllowance: (spenderAddr: Address, sub: bigint) =>
        token.write.decreaseAllowance([spenderAddr, sub]),

      // Owner controls
      mint: (to: Address, amount: bigint) => token.write.mint([to, amount]),
      burnFrom: (from: Address, amount: bigint) =>
        token.write.burnFrom([from, amount]),
      pause: () => token.write.pause(),
      unpause: () => token.write.unPause?.(),
      // Blacklist helpers proxy the contract's owner-only access control
      blacklist: (addr: Address) =>
        token.write.blackList?.([addr]) ?? token.write.blackList?.([addr]),
      unblacklist: (addr: Address) =>
        token.write.unBlackList?.([addr]) ??
        token.write.unBlackList?.([addr]) ??
        token.write.unBlackList?.([addr]),
    };

    return {
      token,
      initialSupply,
      owner,
      user1,
      user2,
      spender,
      tokenAsUser1,
      tokenAsUser2,
      tokenAsSpender,
      api,
    };
  }

  // ─────────────────────────────────────────────
  // A) Deploy & Metadata
  // ─────────────────────────────────────────────
  it('deploy: name/symbol/decimals set, initial supply to owner', async () => {
    const { token, initialSupply, owner, api } = await deploy();

    assert.equal(await token.read.name(), 'MiniUSDT');
    assert.equal(await token.read.symbol(), 'mUSDT');
    assert.equal(await token.read.decimals(), 6);

    assert.equal(await token.read.totalSupply(), initialSupply);
    assert.equal(await api.balanceOf(owner.account.address), initialSupply);
  });

  // ─────────────────────────────────────────────
  // C) transfer
  // ─────────────────────────────────────────────
  it('transfer: moves balances', async () => {
    const { owner, user1, api } = await deploy();

    await api.transfer(user1.account.address, 100_000n); // 0.1 USDT
    const ownerBal = await api.balanceOf(owner.account.address);
    const user1Bal = await api.balanceOf(user1.account.address);

    assert.equal(user1Bal, 100_000n);
    assert.equal(ownerBal, 900_000n);
  });

  it('transfer: reverts on insufficient balance', async () => {
    const { user2, user1, tokenAsUser2 } = await deploy();
    await expectRevert(
      () => tokenAsUser2.write.transfer([user1.account.address, 1n]),
      'NotEnoughBalance'
    );
  });

  it('transfer: reverts on zero address', async () => {
    const { api } = await deploy();
    await expectRevert(
      () => api.transfer('0x0000000000000000000000000000000000000000', 1n),
      'ZeroAddress'
    );
  });

  it('transfer: reverts on zero amount (if you enforce it)', async () => {
    const { user1, api } = await deploy();
    await expectRevert(
      () => api.transfer(user1.account.address, 0n),
      'ZeroAmount'
    );
  });

  // ─────────────────────────────────────────────
  // D) approve / allowance
  // ─────────────────────────────────────────────
  it('approve: sets allowance (not add), allowance() returns correct value', async () => {
    const { owner, spender, api } = await deploy();

    assert.equal(
      await api.allowance(owner.account.address, spender.account.address),
      0n
    );

    await api.approve(spender.account.address, 100n);
    assert.equal(
      await api.allowance(owner.account.address, spender.account.address),
      100n
    );

    // approve again should SET, not add
    await api.approve(spender.account.address, 40n);
    assert.equal(
      await api.allowance(owner.account.address, spender.account.address),
      40n
    );
  });

  it('approve: allows zero amount (recommended for real wallets)', async () => {
    const { owner, spender, api } = await deploy();
    await api.approve(spender.account.address, 0n);
    assert.equal(
      await api.allowance(owner.account.address, spender.account.address),
      0n
    );
  });

  // ─────────────────────────────────────────────
  // E) transferFrom
  // ─────────────────────────────────────────────
  it('transferFrom: works, decreases allowance, moves balances', async () => {
    const { owner, user2, spender, api } = await deploy();

    // owner allows spender
    await api.approve(spender.account.address, 200_000n);

    // spender pulls from owner -> user2
    await api.transferFromAsSpender(
      owner.account.address,
      user2.account.address,
      60_000n
    );

    const ownerBal = await api.balanceOf(owner.account.address);
    const user2Bal = await api.balanceOf(user2.account.address);
    const remaining = await api.allowance(
      owner.account.address,
      spender.account.address
    );

    assert.equal(user2Bal, 60_000n);
    assert.equal(ownerBal, 940_000n);
    assert.equal(remaining, 140_000n);
  });

  it('transferFrom: reverts if allowance insufficient', async () => {
    const { owner, user2, spender, api } = await deploy();
    await api.approve(spender.account.address, 50n);

    await expectRevert(
      () =>
        api.transferFromAsSpender(
          owner.account.address,
          user2.account.address,
          60n
        ),
      'NotEnoughApproval'
    );
  });

  it('transferFrom: reverts if from balance insufficient', async () => {
    const { owner, user1, user2, spender, api, token } = await deploy();

    // owner transfers almost all to user1, leaving 1
    await token.write.transfer([user1.account.address, 999_999n]);

    // owner approves spender for a lot, but owner balance is only 1
    await api.approve(spender.account.address, 1000n);

    await expectRevert(
      () =>
        api.transferFromAsSpender(
          owner.account.address,
          user2.account.address,
          10n
        ),
      'NotEnoughBalance'
    );
  });

  it('transferFrom: reverts on zero address', async () => {
    const { owner, user2, spender, api } = await deploy();
    await api.approve(spender.account.address, 10n);

    await expectRevert(
      () =>
        api.transferFromAsSpender(
          owner.account.address,
          '0x0000000000000000000000000000000000000000',
          1n
        ),
      'ZeroAddress'
    );
  });

  // ─────────────────────────────────────────────
  // F) increase/decrease allowance
  // ─────────────────────────────────────────────
  it('increaseAllowance: increases and allowance matches', async () => {
    const { owner, spender, api } = await deploy();

    await api.approve(spender.account.address, 10n);
    await api.increaseAllowance(spender.account.address, 5n);

    assert.equal(
      await api.allowance(owner.account.address, spender.account.address),
      15n
    );
  });

  it('decreaseAllowance: decreases and reverts if underflow', async () => {
    const { owner, spender, api } = await deploy();

    await api.approve(spender.account.address, 5n);
    await expectRevert(
      () => api.decreaseAllowance(spender.account.address, 6n),
      'AllowanceUnderflow'
    );

    await api.decreaseAllowance(spender.account.address, 3n);
    assert.equal(
      await api.allowance(owner.account.address, spender.account.address),
      2n
    );
  });

  // ─────────────────────────────────────────────
  // G) Owner-only controls
  // ─────────────────────────────────────────────
  it('mint: owner-only and increases totalSupply + receiver balance', async () => {
    const { token, user1, api, tokenAsUser1 } = await deploy();

    // non-owner cannot mint
    await expectRevert(
      () => tokenAsUser1.write.mint([user1.account.address, 1n]),
      'OwnerOnly'
    );

    const tsBefore = await token.read.totalSupply();
    const balBefore = await api.balanceOf(user1.account.address);

    await api.mint(user1.account.address, 123n);

    const tsAfter = await token.read.totalSupply();
    const balAfter = await api.balanceOf(user1.account.address);

    assert.equal(tsAfter, (tsBefore as bigint) + 123n);
    assert.equal(balAfter, (balBefore as bigint) + 123n);
  });

  it('burnFrom: owner-only and reduces totalSupply + from balance', async () => {
    const { token, user1, api, tokenAsUser1 } = await deploy();

    // give user1 some tokens
    await api.mint(user1.account.address, 500n);

    // non-owner cannot burnFrom
    await expectRevert(
      () => tokenAsUser1.write.burnFrom([user1.account.address, 1n]),
      'OwnerOnly'
    );

    const tsBefore = await token.read.totalSupply();
    const balBefore = await api.balanceOf(user1.account.address);

    await api.burnFrom(user1.account.address, 200n);

    const tsAfter = await token.read.totalSupply();
    const balAfter = await api.balanceOf(user1.account.address);

    assert.equal(tsAfter, (tsBefore as bigint) - 200n);
    assert.equal(balAfter, (balBefore as bigint) - 200n);
  });

  it('burnFrom: reverts if from has insufficient balance', async () => {
    const { user2, api } = await deploy();
    await expectRevert(
      () => api.burnFrom(user2.account.address, 1n),
      'NotEnoughBalance'
    );
  });

  // ─────────────────────────────────────────────
  // H) Pause behavior
  // ─────────────────────────────────────────────
  it('pause/unpause: owner-only; paused blocks transfer/approve/transferFrom', async () => {
    const { owner, user1, user2, spender, api, tokenAsUser1 } = await deploy();

    // non-owner cannot pause
    await expectRevert(() => tokenAsUser1.write.pause(), 'OwnerOnly');

    // pause
    await api.pause();

    // transfer blocked
    await expectRevert(
      () => api.transfer(user1.account.address, 1n),
      'ContractHasPaused'
    );

    // approve blocked
    await expectRevert(
      () => api.approve(spender.account.address, 1n),
      'ContractHasPaused'
    );

    // transferFrom blocked
    // (need allowance first, but approve is blocked; just ensure transferFrom itself reverts)
    await expectRevert(
      () =>
        api.transferFromAsSpender(
          owner.account.address,
          user2.account.address,
          1n
        ),
      'ContractHasPaused'
    );

    // unpause
    await api.unpause();

    // now transfer works again
    await api.transfer(user1.account.address, 1n);
    assert.equal(await api.balanceOf(user1.account.address), 1n);
  });

  // ─────────────────────────────────────────────
  // I) Blacklist behavior
  // ─────────────────────────────────────────────
  it('blacklist: owner-only; blocks sender/receiver/spender; unblacklist restores', async () => {
    const { owner, user1, user2, spender, api, tokenAsUser1, tokenAsSpender } =
      await deploy();

    // 0) non-owner cannot blacklist
    await expectRevert(async () => {
      await tokenAsUser1.write.blackList([user1.account.address]);
      // await tokenAsUser1.write.balckList([user1.account.address]);
    }, 'OwnerOnly');

    // 1) Sender blocked: user1 must have tokens BEFORE being blacklisted
    await api.transfer(user1.account.address, 10n); // user1 gets tokens

    await api.blacklist(user1.account.address);

    await expectRevert(
      () => tokenAsUser1.write.transfer([user2.account.address, 1n]),
      'UserHasBlocked'
    );

    // 2) Receiver blocked: nobody can send to user2 when user2 is blacklisted
    await api.blacklist(user2.account.address);

    await expectRevert(
      () => api.transfer(user2.account.address, 1n),
      'UserHasBlocked'
    );

    // 3) Spender blocked: spender cannot call transferFrom even with allowance
    // First unblacklist user1 (so we can use it as destination safely)
    await api.unblacklist(user1.account.address);

    // Approve spender from owner
    await api.approve(spender.account.address, 5n);

    // Now blacklist spender
    await api.blacklist(spender.account.address);

    await expectRevert(
      () =>
        tokenAsSpender.write.transferFrom([
          owner.account.address,
          user1.account.address,
          1n,
        ]),
      'UserHasBlocked'
    );

    // 4) Unblacklist restores: unblacklist spender and receiver and try again
    await api.unblacklist(spender.account.address);
    await api.unblacklist(user2.account.address);

    // Re-approve just in case (depends on your contract behavior; safe to do)
    await api.approve(spender.account.address, 5n);

    // Now spender can transferFrom
    await tokenAsSpender.write.transferFrom([
      owner.account.address,
      user2.account.address,
      1n,
    ]);

    const user2Bal = await api.balanceOf(user2.account.address);
    assert.equal(user2Bal, 1n);
  });
});
