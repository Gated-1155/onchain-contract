import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";

const { ethers, networkHelpers } = await network.create();

describe("BadgeToken", function () {
  async function deployBadgeToken() {
    const [admin, pauser, minter, alice, bob, operator] = await ethers.getSigners();

    const badge = await ethers.deployContract("BadgeToken", [
      admin.address,
      pauser.address,
      minter.address,
    ]);

    return { badge, admin, pauser, minter, alice, bob, operator };
  }

  // Convenience: register one badge type and (optionally) mint it to `to`.
  async function createBadgeType(
    badge: Awaited<ReturnType<typeof deployBadgeToken>>["badge"],
    admin: Awaited<ReturnType<typeof deployBadgeToken>>["admin"],
    uri: string,
    transferable: boolean,
  ) {
    await badge.connect(admin).createBadgeType(uri, transferable);
  }

  describe("Badge ID sequencing (createBadgeType)", function () {
    it("issues sequential ids starting at 1", async function () {
      const { badge, admin } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(badge.connect(admin).createBadgeType("https://example.com/badge-1.json", false))
        .to.emit(badge, "BadgeTypeCreated")
        .withArgs(1n, "https://example.com/badge-1.json", false);

      await expect(badge.connect(admin).createBadgeType("https://example.com/badge-2.json", true))
        .to.emit(badge, "BadgeTypeCreated")
        .withArgs(2n, "https://example.com/badge-2.json", true);

      expect(await badge.isTransferable(1n)).to.equal(false);
      expect(await badge.isTransferable(2n)).to.equal(true);
    });

    it("rejects createBadgeType from a non-admin account", async function () {
      const { badge, alice } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(badge.connect(alice).createBadgeType("x", false))
        .to.be.revertedWithCustomError(badge, "AccessControlUnauthorizedAccount")
        .withArgs(alice.address, anyValue);
    });
  });

  describe("Metadata URI", function () {
    it("returns the per-id URI registered at creation", async function () {
      const { badge, admin } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);

      expect(await badge.uri(1n)).to.equal("https://example.com/badge-1.json");
    });

    it("reverts for an unregistered id", async function () {
      const { badge } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(badge.uri(1n))
        .to.be.revertedWithCustomError(badge, "BadgeTypeDoesNotExist")
        .withArgs(1n);
    });

    it("rejects a URI that isn't https://", async function () {
      const { badge, admin } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(
        badge.connect(admin).createBadgeType("ftp://example.com/badge.json", false),
      ).to.be.revertedWithCustomError(badge, "InvalidUri");
    });

    it("rejects a URI that doesn't end in .json", async function () {
      const { badge, admin } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(
        badge.connect(admin).createBadgeType("https://example.com/badge.png", false),
      ).to.be.revertedWithCustomError(badge, "InvalidUri");
    });

    it("rejects a plain non-URL string - the shape of an actual admin typo", async function () {
      const { badge, admin } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(
        badge.connect(admin).createBadgeType("123", false),
      ).to.be.revertedWithCustomError(badge, "InvalidUri");
    });
  });

  describe("Minting", function () {
    it("mints a registered badge id to a recipient", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);

      await badge.connect(minter).mint(alice.address, 1n, 3n, "0x");

      expect(await badge.balanceOf(alice.address, 1n)).to.equal(3n);
    });

    it("rejects minting an unregistered badge id", async function () {
      const { badge, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(badge.connect(minter).mint(alice.address, 1n, 1n, "0x"))
        .to.be.revertedWithCustomError(badge, "BadgeTypeDoesNotExist")
        .withArgs(1n);
    });

    it("rejects minting from a non-minter account", async function () {
      const { badge, admin, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);

      await expect(badge.connect(alice).mint(alice.address, 1n, 1n, "0x"))
        .to.be.revertedWithCustomError(badge, "AccessControlUnauthorizedAccount")
        .withArgs(alice.address, anyValue);
    });
  });

  describe("Transfer blocking (core requirement)", function () {
    it("blocks a direct safeTransferFrom on a non-transferable badge", async function () {
      const { badge, admin, minter, alice, bob } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);
      await badge.connect(minter).mint(alice.address, 1n, 1n, "0x");

      await expect(
        badge.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x"),
      )
        .to.be.revertedWithCustomError(badge, "BadgeNotTransferable")
        .withArgs(1n);

      // balance must be unchanged after the revert
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(1n);
    });

    it("allows safeTransferFrom on a transferable badge", async function () {
      const { badge, admin, minter, alice, bob } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", true);
      await badge.connect(minter).mint(alice.address, 1n, 1n, "0x");

      await badge.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x");

      expect(await badge.balanceOf(alice.address, 1n)).to.equal(0n);
      expect(await badge.balanceOf(bob.address, 1n)).to.equal(1n);
    });

    it("blocks safeBatchTransferFrom entirely if any single id in the batch is non-transferable", async function () {
      const { badge, admin, minter, alice, bob } = await networkHelpers.loadFixture(deployBadgeToken);
      // id 1: transferable, id 2: non-transferable
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", true);
      await createBadgeType(badge, admin, "https://example.com/badge-2.json", false);
      await badge.connect(minter).mintBatch(alice.address, [1n, 2n], [1n, 1n], "0x");

      await expect(
        badge.connect(alice).safeBatchTransferFrom(alice.address, bob.address, [1n, 2n], [1n, 1n], "0x"),
      )
        .to.be.revertedWithCustomError(badge, "BadgeNotTransferable")
        .withArgs(2n);

      // neither id moved — the whole batch reverted atomically
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(1n);
      expect(await badge.balanceOf(alice.address, 2n)).to.equal(1n);
      expect(await badge.balanceOf(bob.address, 1n)).to.equal(0n);
    });

    it("blocks setApprovalForAll entirely, so no operator can ever be approved", async function () {
      const { badge, alice, bob, operator } = await networkHelpers.loadFixture(deployBadgeToken);

      await expect(
        badge.connect(alice).setApprovalForAll(operator.address, true),
      ).to.be.revertedWithCustomError(badge, "ApprovalNotAllowed");

      expect(await badge.isApprovedForAll(alice.address, operator.address)).to.equal(false);

      // with no approval ever possible, a would-be operator transfer falls
      // back to the standard ERC1155 "missing approval" error — it never even
      // reaches our BadgeNotTransferable check.
      await expect(
        badge.connect(operator).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x"),
      )
        .to.be.revertedWithCustomError(badge, "ERC1155MissingApprovalForAll")
        .withArgs(operator.address, alice.address);
    });

    it("reflects a setTransferable toggle on the very next transfer attempt", async function () {
      const { badge, admin, minter, alice, bob } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);
      await badge.connect(minter).mint(alice.address, 1n, 1n, "0x");

      await expect(
        badge.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x"),
      )
        .to.be.revertedWithCustomError(badge, "BadgeNotTransferable")
        .withArgs(1n);

      await expect(badge.connect(admin).setTransferable(1n, true))
        .to.emit(badge, "BadgeTransferabilityUpdated")
        .withArgs(1n, true);

      await badge.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x");

      expect(await badge.balanceOf(bob.address, 1n)).to.equal(1n);
    });
  });

  describe("Mint / burn bypass the transferable check", function () {
    it("mints a non-transferable badge without reverting", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);

      await badge.connect(minter).mint(alice.address, 1n, 1n, "0x");

      expect(await badge.balanceOf(alice.address, 1n)).to.equal(1n);
    });

    it("lets the holder burn their own non-transferable badge", async function () {
      const { badge, admin, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);
      await badge.connect(minter).mint(alice.address, 1n, 1n, "0x");

      await badge.connect(alice).burn(alice.address, 1n, 1n);

      expect(await badge.balanceOf(alice.address, 1n)).to.equal(0n);
    });
  });

  describe("Pause", function () {
    it("blocks minting while paused, and only PAUSER_ROLE can pause", async function () {
      const { badge, admin, pauser, minter, alice } = await networkHelpers.loadFixture(deployBadgeToken);
      await createBadgeType(badge, admin, "https://example.com/badge-1.json", false);

      await expect(badge.connect(admin).pause())
        .to.be.revertedWithCustomError(badge, "AccessControlUnauthorizedAccount")
        .withArgs(admin.address, anyValue);

      await badge.connect(pauser).pause();

      await expect(
        badge.connect(minter).mint(alice.address, 1n, 1n, "0x"),
      ).to.be.revertedWithCustomError(badge, "EnforcedPause");

      await badge.connect(pauser).unpause();

      await badge.connect(minter).mint(alice.address, 1n, 1n, "0x");
      expect(await badge.balanceOf(alice.address, 1n)).to.equal(1n);
    });
  });
});
