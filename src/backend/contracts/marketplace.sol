pragma solidity ^0.8.4;

//interfaces help in interacting with other contracts without having to know its code
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

//marketplace will charge fees for each nft purchased 

contract marketplace is ReentrancyGuard {

    //keeping track of the account that receives this feees
    address payable  public immutable feeAccount;
    //fee percentage on sales
    uint public immutable feePercent;
    uint public itemCount;

    //grouping all the data associated with the NFT in the market
    struct Item {
        uint itemId;
        IERC721 nft;
        uint tokenId;
        uint price;
        address payable seller;
        bool sold;
    }

    //index allows us to search 
    event offered (
        uint itemId,
        address indexed nft, 
        uint tokenId,
        uint price,
        address indexed seller
    );

    event bought (
        uint itemId,
        address indexed nft,
        uint tokenId,
        uint price,
        address indexed seller,
        address indexed buyer
    );

    //mapping to store all the nfts in one place: itemid -> item 
    mapping (uint => Item) public items;

     //constructor to initialize fee percent and feeaccount
    constructor (uint _feePercent){
        feeAccount = payable(msg.sender);
        feePercent = _feePercent;
    }

    //funcion that makes NFTS
    function makeItem(IERC721 _nft, uint _tokenId, uint _price) external nonReentrant {
        require(_price > 0, "Price cant be 0");
        itemCount++;
        //transfer from the address of who calls this function to the address of contract 
        _nft.transferFrom(msg.sender, address(this), _tokenId);
        //now add items to items mapping
        items[itemCount] = Item (
            itemCount,
            _nft,
            _tokenId,
            _price,
            payable(msg.sender),
            false
        );

        //now we want this funciton to emit an event 
        //event allows us to log data into ETH blockchain 
        //think of it some cheap storage  

        emit offered (
            itemCount,
            address(_nft),
            _tokenId,
            _price,
            msg.sender
        );
    }

    function purchaseItem(uint _itemId) external payable nonReentrant {
        uint _totalPrice = getTotalPrice(_itemId);
        //get the item from the items mapping and store it in a storage variable
        //storage means this variable is reading directly from the memory
        Item storage item = items[_itemId];
        //making sure item exists
        require(_itemId>0 && _itemId <= itemCount, "item doesnt exist");
        //making sure user pays reight amount
        require(msg.value >= _totalPrice,"not enough ether to cover the markplace fee and item price");
        //making sure item isnt already sold
        require(!item.sold,"item already sold");
        //pay the seller and feeAccount 
        item.seller.transfer(item.price);
        feeAccount.transfer(_totalPrice-item.price);
        //update item as sold
        item.sold = true;
        //transfer nft to buyer
        item.nft.transferFrom(address(this), msg.sender, item.tokenId);

        //emit a bought event
        emit bought (
            _itemId,
            address(item.nft),
            item.tokenId,
            item.price,
            item.seller,
            msg.sender
        );

    }

    //returns price set by seller + market fees
    function getTotalPrice(uint _itemId) view public returns(uint){
        return(items[_itemId].price*(100+feePercent)/100);
    }

}