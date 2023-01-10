// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

/**
 * @dev HardHat doesn't support multiple source folders; so import everything
 * extra that reference tests rely on so they get compiled. Allows for faster
 * feedback than running an extra yarn build
 */
import { EIP1271Wallet } from "../../test/EIP1271Wallet.sol";
import { Reenterer } from "../../test/Reenterer.sol";
import { TestERC20 } from "../../mocks/TestERC20.sol";
import { TestERC721 } from "../../mocks/TestERC721.sol";
import { TestERC1155 } from "../../mocks/TestERC1155.sol";
import { TestZone } from "../../test/TestZone.sol";
import { TransferHelper } from "../../helpers/TransferHelper.sol";
import {
    ImmutableCreate2FactoryInterface
} from "../../interfaces/ImmutableCreate2FactoryInterface.sol";