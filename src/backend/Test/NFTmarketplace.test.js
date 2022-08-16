const { expect } = require("chai");
const { ethers } = require("hardhat");
const toWei = (num) => ethers.utils.parseEther(num.toString());
const fromWei = (num) => ethers.utils.formatEther(num);
describe("NFTmarketplace", function () {
  let deployer,
    addr1,
    addr2,
    nft,
    marketplace,
    feePercent = 1,
    URI = "Sample URI";

  beforeEach(async function () {
    const NFT = await ethers.getContractFactory("NFT");
    const Marketplace = await ethers.getContractFactory("marketplace");

    [deployer, addr1, addr2] = await ethers.getSigners();

    nft = await NFT.deploy();
    marketplace = await Marketplace.deploy(feePercent);
  });
  //making sure each contract is deployed correctly
  describe("Deployment", function () {
    it("Should track name and symbol of the nft collection", async function () {
      expect(await nft.name()).to.equal("iVobs NFT");
      expect(await nft.symbol()).to.equal("DSP");
    });
    it("Should track feePercent and feeAddress of the marketplace", async function () {
      expect(await marketplace.feePercent()).to.equal(feePercent);
      expect(await marketplace.feeAccount()).to.equal(deployer.address);
    });
  });

  describe("Minting NFTs", function () {
    it("Should track each minted NFT", async function () {
      //addr1 mints an NFT
      await nft.connect(addr1).mint(URI);
      expect(await nft.tokenCount()).to.equal(1);
      expect(await nft.balanceOf(addr1.address)).to.equal(1);
      expect(await nft.tokenURI(1)).to.equal(URI);
      //addr2 mints an NFT
      await nft.connect(addr2).mint(URI);
      expect(await nft.tokenCount()).to.equal(2);
      expect(await nft.balanceOf(addr2.address)).to.equal(1);
      expect(await nft.tokenURI(2)).to.equal(URI);
    });
  });

  describe("Making Marketplace items", function () {
    beforeEach(async function () {
      //mints an NFT for addr1
      await nft.connect(addr1).mint(URI);
      //here addr1 approves marketplace to spend nft
      //we need to approve because in order for the transferfrom function work the caller of the makeitem function needs to approve the marketplace contract
      await nft.connect(addr1).setApprovalForAll(marketplace.address, true);
    });

    it("Should track newly created item, transfer NFT from seller to marketplace and emit offered event", async function () {
      //addr1 offers their NFT for price of 1 ether

      await expect(
        marketplace.connect(addr1).makeItem(nft.address, 1, toWei(1))
      )
        .to.emit(marketplace, "offered")
        .withArgs(1, nft.address, 1, toWei(1), addr1.address);

      //owner of NFT should now be the marketplace, lets check
      expect(await nft.ownerOf(1)).to.equal(marketplace.address);
      //item count should be equal to 1
      expect(await marketplace.itemCount()).to.equal(1);
      //get items from item mapping ensuring the fields are correct
      const item = await marketplace.items(1);
      console.log(item);
      expect(item.itemId).to.equal(1);
      expect(item.nft).to.equal(nft.address);
      expect(item.tokenId).to.equal(1);
      expect(item.price).to.equal(toWei(1));
      expect(item.sold).to.equal(false);
    });

    it("should fail if the price is set to 0", async function () {
      await expect(
        marketplace.connect(addr1).makeItem(nft.address, 1, 0)
      ).to.be.revertedWith("Price cant be 0");
    });
  });

  describe("Purchasing marketplace items", function () {
    let price = 2;
    let totalPriceinWei;
    const fee = (feePercent / 100) * price;

    beforeEach(async function () {
      //mints an NFT for addr1
      await nft.connect(addr1).mint(URI);
      //here addr1 approves marketplace to spend nft
      //we need to approve because in order for the transferfrom function work the caller of the makeitem function needs to approve the marketplace contract
      await nft.connect(addr1).setApprovalForAll(marketplace.address, true);
      // addr1 lists their nft on the marketplace
      await marketplace.connect(addr1).makeItem(nft.address, 1, toWei(2));
    });

    it("Should update item as sold, pay seller, transfer NFT to buyer, charge fees and emit a bought event", async function () {
      const sellerInitialEthBal = await addr1.getBalance();
      const feeAccountInitialEthBal = await deployer.getBalance();

      //fetch items total price (market fees + item price)
      totalPriceinWei = await marketplace.getTotalPrice(1);
      //addr2 purchases item
      await expect(
        marketplace.connect(addr2).purchaseItem(1, { value: totalPriceinWei })
      )
        .to.emit(marketplace, "bought")
        .withArgs(
          1,
          nft.address,
          1,
          toWei(price),
          addr1.address,
          addr2.address
        );

      const sellerFinalEthBal = await addr1.getBalance();
      const feeAccountFinalEthBal = await deployer.getBalance();

      //ensure item is marked as sold
      expect((await marketplace.items(1)).sold).to.equal(true);
      //seller should receive the amount of the NFT sold
      expect(+fromWei(sellerFinalEthBal)).to.equal(
        +price + +fromWei(sellerInitialEthBal)
      );
      //fee account should receive fee
      expect(+fromWei(feeAccountFinalEthBal)).to.equal(
        +fee + +fromWei(feeAccountInitialEthBal)
      );
      //ensure buyer owns the nft
      expect(await nft.ownerOf(1)).to.equal(addr2.address);
    });

    it("should fail for invalid item ids, sold items and when not enough ether is paid", async function () {
      //fails for invalid item ids

      await expect(
        marketplace.connect(addr2).purchaseItem(2, { value: totalPriceinWei })
      ).to.be.revertedWith("item doesnt exist");

      await expect(
        marketplace.connect(addr2).purchaseItem(0, { value: totalPriceinWei })
      ).to.be.revertedWith("item doesnt exist");

      //fails when not enough ether is sent

      await expect(
        marketplace.connect(addr2).purchaseItem(1, { value: toWei(price) })
      ).to.be.revertedWith(
        "not enough ether to cover the markplace fee and item price"
      );

      //addr2 purchases item 1
      await marketplace
        .connect(addr2)
        .purchaseItem(1, { value: totalPriceinWei });
      //deployer tries purchasing item 1 after its sold

      await expect(
        marketplace
          .connect(deployer)
          .purchaseItem(1, { value: totalPriceinWei })
      ).to.be.revertedWith("item already sold");
    });
  });
});
