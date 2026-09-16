import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

// These tests reproduce specific "this is how it breaks" scenarios for the
// 실패 시나리오 문서, as opposed to BadgeToken.ts which verifies the intended
// behavior (전송 경로 조사 문서). Each `it()` here maps to one documented
// scenario — keep that 1:1 correspondence when adding more.
describe("BadgeToken failure scenarios", function () {
  async function deployBadgeToken() {
    const [admin, pauser, minter, alice, bob] = await ethers.getSigners();

    const badge = await ethers.deployContract("BadgeToken", [
      admin.address,
      pauser.address,
      minter.address,
    ]);

    return { badge, admin, pauser, minter, alice, bob };
  }

  describe("Scenario: sole admin renounces DEFAULT_ADMIN_ROLE", function () {
    it("permanently locks out badge-type management and role administration", async function () {
      const { badge, admin } = await networkHelpers.loadFixture(deployBadgeToken);

      const DEFAULT_ADMIN_ROLE = await badge.DEFAULT_ADMIN_ROLE();
      expect(await badge.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);

      // admin renounces its own admin role — a single fat-fingered tx, or a
      // malicious dApp tricking the admin into signing it.
      await badge.connect(admin).renounceRole(DEFAULT_ADMIN_ROLE, admin.address);

      expect(await badge.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(false);

      // From this point on, nobody — not even the original admin — can ever
      // register a new badge type, toggle transferable, or grant DEFAULT_ADMIN_ROLE
      // to anyone (DEFAULT_ADMIN_ROLE is its own role admin, and there is no
      // multisig/timelock holding a backup). The contract is not upgradeable
      // (UUPS is explicitly out of scope), so this is permanent for this
      // deployment.
      await expect(badge.connect(admin).createBadgeType("https://example.com/badge-1.json", false))
        .to.be.revertedWithCustomError(badge, "AccessControlUnauthorizedAccount")
        .withArgs(admin.address, DEFAULT_ADMIN_ROLE);

      await expect(badge.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, admin.address))
        .to.be.revertedWithCustomError(badge, "AccessControlUnauthorizedAccount")
        .withArgs(admin.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("Scenario: mintBatch called with malformed input", function () {
    it("reverts the whole call when ids/amounts array lengths don't match", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await badge.connect(admin).createBadgeType("https://example.com/badge-1.json", false);

      await expect(badge.connect(minter).mintBatch(alice.address, [1n], [1n, 2n], "0x"))
        .to.be.revertedWithCustomError(badge, "ERC1155InvalidArrayLength")
        .withArgs(1n, 2n);
    });

    it("reverts the whole batch (mints nothing) when one id among several was never registered", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await badge.connect(admin).createBadgeType("https://example.com/badge-1.json", false);
      // id 2 is intentionally never registered.

      await expect(badge.connect(minter).mintBatch(alice.address, [1n, 2n], [5n, 5n], "0x"))
        .to.be.revertedWithCustomError(badge, "BadgeTypeDoesNotExist")
        .withArgs(2n);

      // id 1 must not have been minted either — no partial batch.
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(0n);
    });
  });

  describe("Fixed: uri() and isTransferable() now agree on how to report an unregistered id", function () {
    it("both revert with BadgeTypeDoesNotExist for the same unregistered id", async function () {
      // Previously isTransferable() silently returned `false` for an
      // unregistered id instead of reverting like uri() does, so a caller
      // couldn't tell "registered and non-transferable" apart from "never
      // registered" without also calling uri(). Fixed 2026-09-14.
      const { badge } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(badge.uri(99n))
        .to.be.revertedWithCustomError(badge, "BadgeTypeDoesNotExist")
        .withArgs(99n);

      await expect(badge.isTransferable(99n))
        .to.be.revertedWithCustomError(badge, "BadgeTypeDoesNotExist")
        .withArgs(99n);
    });
  });

  describe("Scenario: malicious ERC-1155 receiver reenters during onERC1155Received", function () {
    it("cannot double-spend or observe a stale balance, because _update commits state before the hook fires", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await badge.connect(admin).createBadgeType("https://example.com/badge-1.json", true);

      const attacker = await ethers.deployContract("MaliciousReceiver");
      await badge.connect(minter).mint(alice.address, 1n, 5n, "0x");

      await attacker.configure(
        await badge.getAddress(),
        alice.address, // reentryTo: bounce the badge straight back to alice
        1n,
        5n,
        true, // attackOnReceive
      );

      // alice transfers all 5 units to the attacker contract. Its
      // onERC1155Received hook fires and immediately tries to transfer them
      // straight back out, from inside the same call stack.
      await badge.connect(alice).safeTransferFrom(alice.address, await attacker.getAddress(), 1n, 5n, "0x");

      // The hook observed the balance *after* the crediting transfer had
      // already applied — proving _update runs before the receiver callback
      // (checks-effects-interactions), not after.
      expect(await attacker.balanceDuringCallback()).to.equal(5n);
      expect(await attacker.reentrantCallSucceeded()).to.equal(true);

      // Net effect: the reentrant transfer actually moved the tokens back out
      // to alice within the same transaction. No double-crediting occurred —
      // the attacker ends up with 0, alice ends up with exactly what she
      // started with, not 5 "extra" from a reentrancy bug.
      expect(await badge.balanceOf(await attacker.getAddress(), 1n)).to.equal(0n);
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(5n);
    });

    it("cannot conjure extra balance: reentrant transfer of more than was actually received reverts", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await badge.connect(admin).createBadgeType("https://example.com/badge-1.json", true);

      const attacker = await ethers.deployContract("MaliciousReceiver");
      await badge.connect(minter).mint(alice.address, 1n, 5n, "0x");

      // attacker will try to reentrantly move out MORE than it is about to
      // receive (10 instead of the 3 alice is sending it).
      await attacker.configure(await badge.getAddress(), alice.address, 1n, 10n, true);

      await expect(
        badge.connect(alice).safeTransferFrom(alice.address, await attacker.getAddress(), 1n, 3n, "0x"),
      )
        .to.be.revertedWithCustomError(badge, "ERC1155InsufficientBalance")
        .withArgs(await attacker.getAddress(), 3n, 10n, 1n);

      // the whole outer transfer must have rolled back too — alice keeps all 5.
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(5n);
      expect(await badge.balanceOf(await attacker.getAddress(), 1n)).to.equal(0n);
    });

    it("cannot steal an unrelated holder's balance — no approval exists regardless of reentrancy timing", async function () {
      const { badge, admin, minter, alice, bob } = await networkHelpers.loadFixture(deployBadgeToken);
      await badge.connect(admin).createBadgeType("https://example.com/badge-1.json", true);

      const attacker = await ethers.deployContract("MaliciousReceiver");

      // alice and bob each independently hold the same badge id.
      await badge.connect(minter).mint(alice.address, 1n, 5n, "0x");
      await badge.connect(minter).mint(bob.address, 1n, 3n, "0x");

      // configure the reentrant call to pull FROM bob (never approved us) instead
      // of from our own just-credited balance.
      const attackerAddress = await attacker.getAddress();
      await attacker.configure(
        await badge.getAddress(),
        attackerAddress, // reentryTo: send the "stolen" tokens to ourselves
        1n,
        3n,
        true, // attackOnReceive
      );
      await attacker.setStealFrom(bob.address);

      // alice's transfer to the attacker triggers the hook; the attacker tries
      // to use that moment to pull bob's balance, not its own.
      await expect(
        badge.connect(alice).safeTransferFrom(alice.address, attackerAddress, 1n, 1n, "0x"),
      )
        .to.be.revertedWithCustomError(badge, "ERC1155MissingApprovalForAll")
        .withArgs(attackerAddress, bob.address);

      // whole tx rolled back — nobody's balance moved, including alice's.
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(5n);
      expect(await badge.balanceOf(bob.address, 1n)).to.equal(3n);
      expect(await badge.balanceOf(attackerAddress, 1n)).to.equal(0n);
    });
  });
});
