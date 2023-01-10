import { UniversalRouter, Permit2, ERC20, MockLooksRareRewardsDistributor, TestERC20, TestERC721, ConsiderationInterface } from '../../typechain'
import { BigNumber, Wallet } from 'ethers'
import { expect } from './shared/expect'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import {
  ROUTER_REWARDS_DISTRIBUTOR,
} from './shared/constants'
import { seaportInterface } from './shared/protocolHelpers/seaport'
import type { OfferItem, ConsiderationItem } from './shared/protocolHelpers/seaport/types'
import { toFulfillment, randomHex } from './shared/protocolHelpers/seaport/encoding'
import { faucet } from './shared/protocolHelpers/seaport/faucet'
import { CommandType, RoutePlanner } from './shared/planner'
import { simulateMatchOrders } from './shared/protocolHelpers/seaport/helpers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
import { seaportFixture } from "./shared/protocolHelpers/seaport/fixtures";
//import type { SeaportFixtures } from "./shared/protocolHelpers/seaport/fixtures/";

const { ethers } = hre

// const routerInterface = new ethers.utils.Interface(ROUTER_ABI)

describe('UniversalRouter, Seaport - matchOrders', () => {
    const { provider } = ethers;

    let seller: Wallet;
    let buyer: Wallet;
    let deployer: Wallet;
    let zone: Wallet;
    let router: UniversalRouter
    let permit2: Permit2
    let marketplaceContract: ConsiderationInterface
    let mockLooksRareToken: ERC20
    let mockLooksRareRewardsDistributor: MockLooksRareRewardsDistributor
    let testERC20: TestERC20
    let testERC721: TestERC721
    let planner: RoutePlanner
    let createOrder: Function;
    let createMirrorBuyNowOrder: Function;
    let mintAndApprove721: Function;
    let mintAndApproveERC20: Function;

    describe('ERC20 --> NFT', async () => {
        it('completes a trade for ERC20 --> Seaport NFT', async () => {
            // ****************** before hook ******************
            // local wallets
            seller = new ethers.Wallet(randomHex(32), provider);
            buyer = new ethers.Wallet(randomHex(32), provider);
            deployer = new ethers.Wallet(randomHex(32), provider);
            zone = new ethers.Wallet(randomHex(32), provider);
            
            // use faucet to give ether to seller, buyer and deployer wallets
            for (const wallet of [seller, buyer, deployer, zone]) {
                await faucet(wallet.address, provider);
            }
            
            // seaport deploy
            ({
                createOrder,
                createMirrorBuyNowOrder,
                marketplaceContract,
                testERC20,
                testERC721,
                mintAndApprove721,
                mintAndApproveERC20,
            } = await seaportFixture(deployer));
            console.log("HI");
            // mock contracts
            const tokenFactory = await ethers.getContractFactory('MintableERC20')
            const mockDistributorFactory = await ethers.getContractFactory('MockLooksRareRewardsDistributor')
            mockLooksRareToken = (await tokenFactory.connect(deployer).deploy(expandTo18DecimalsBN(5))) as ERC20
            mockLooksRareRewardsDistributor = (await mockDistributorFactory.deploy(
                ROUTER_REWARDS_DISTRIBUTOR,
                mockLooksRareToken.address
            )) as MockLooksRareRewardsDistributor            
            
            // universal router
            permit2 = (await deployPermit2()) as Permit2
            router = (
                await deployUniversalRouter(permit2, mockLooksRareRewardsDistributor.address, mockLooksRareToken.address)
            ) as UniversalRouter
    
            planner = new RoutePlanner()
                
            // seller's price on Seaport
            const price = ethers.utils.parseEther("10000");
            // mint a mock ERC721 token to the seller
            //await testERC721.connect(seller).mint(seller.address, 1)
            await mintAndApprove721(seller, router.address, 1)
            expect(await testERC721.ownerOf(1)).to.eq(seller.address)
            // mint ERC20 tokens to the buyer (price)
            await mintAndApproveERC20(buyer, router.address, price)
            //await testERC20.connect(buyer).mint(buyer.address, price)
            expect(await testERC20.balanceOf(buyer.address)).to.eq(price)
            
            // ****************** test ******************
            // Seller's sell order on OpenSea for the Bored Ape
            const sellOffer: OfferItem[] = [
                {
                    itemType: 2,
                    token: testERC721.address,
                    identifierOrCriteria: BigNumber.from(1),
                    startAmount: BigNumber.from(1),
                    endAmount: BigNumber.from(1),
                },
            ];
            const sellConsideration: ConsiderationItem[] = [
                {
                    itemType: 1,
                    token: testERC20.address,
                    identifierOrCriteria: BigNumber.from(0),
                    startAmount: price.sub(ethers.utils.parseEther("100")), // price - additional recipients amounts
                    endAmount: price.sub(ethers.utils.parseEther("100")),
                    recipient: seller.address,
                },
                {
                    itemType: 1,
                    token: testERC20.address,
                    identifierOrCriteria: BigNumber.from(0),
                    startAmount: ethers.utils.parseEther("50"),
                    endAmount: ethers.utils.parseEther("50"),
                    recipient: zone.address,
                },
                {
                    itemType: 1,
                    token: testERC20.address,
                    identifierOrCriteria: BigNumber.from(0),
                    startAmount: ethers.utils.parseEther("50"),
                    endAmount: ethers.utils.parseEther("50"),
                    recipient: deployer.address,
                },
            ];
            const { value: value, order: sellOrder } = await createOrder(
                seller,
                zone,
                sellOffer,
                sellConsideration,
                0, // FULL_OPEN
            );
            console.log(sellOrder)
            // buyer's signed buy order (external) for same price and same Bored Ape
            const { mirrorOrder } = await createMirrorBuyNowOrder(buyer, zone, sellOrder);
            console.log("buyOrder", mirrorOrder);
            
            // sequence orders are to be executed by Seaport
            const fulfillments = [
                [[[0, 0]], [[1, 0]]],
                [[[1, 0]], [[0, 0]]],
                [[[1, 0]], [[0, 1]]],
                [[[1, 0]], [[0, 2]]],
            ].map(([offerArr, considerationArr]) =>
                toFulfillment(offerArr, considerationArr)
            );

            // const executions = await simulateMatchOrders(
            //     marketplaceContract,
            //     [sellOrder, mirrorOrder],
            //     fulfillments,
            //     deployer,
            //     value
            // );
            // console.log(executions)

            // encode calldata to be passed with the Seaport command
            const calldata = seaportInterface.encodeFunctionData('matchOrders', [
                [sellOrder, mirrorOrder],
                fulfillments,
            ])
            console.log("calldata", calldata);
            // add to planner
            planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
            const { commands, inputs } = planner

            // execute the trade via the OrderRouter
            const balanceBefore = await testERC721.balanceOf(buyer.address)
            await router['execute(bytes,bytes[])'](commands, inputs)
            const balanceAfter = await testERC721.balanceOf(buyer.address)
            //get the balance of the seller 
            const balanceSeller = await testERC721.balanceOf(seller.address)
            console.log("balanceSeller", balanceSeller.toString())

            expect(balanceAfter.sub(balanceBefore)).to.eq(1)
        })
    })
})
