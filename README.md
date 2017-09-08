# Interledger - Starling Bank plugin

## What?

The Interledger Protocol (ILP) is a [protocol suite](https://github.com/interledger/rfcs/blob/master/0001-interledger-architecture/0001-interledger-architecture.md#interledger-protocol-suite) for connecting blockchains and other ledgers.

This plugin implements the ILP [ledger abstraction interface](https://github.com/interledger/rfcs/blob/master/0004-ledger-plugin-interface/0004-ledger-plugin-interface.md), allowing Interledger clients and connectors to communicate with, and route payments across, the [Starling Bank](https://www.starlingbank.com/) ledger.



## Ledger Requirements

Starling meets the [requirements for minimal Interledger support](https://github.com/interledger/rfcs/blob/master/0017-ledger-requirements/0017-ledger-requirements.md#minimal-support), i.e. it has "the ability to transfer funds from one account to another"

The Starling ledger does not support conditional transfers, but we can use it with Interledger in a [number of ways](https://github.com/interledger/rfcs/blob/master/0017-ledger-requirements/0017-ledger-requirements.md#appendix-a-holds-without-native-ledger-support), an implementation being [Trustlines](https://github.com/interledger/rfcs/blob/master/0022-hashed-timelock-agreements/0022-hashed-timelock-agreements.md#trustlines).



## Plugin architecture

This plugin uses the ILP [payment-channel-framework plugin](https://github.com/interledgerjs/ilp-plugin-payment-channel-framework) to save re-implementing common functionality such as implementing the ledger plugin interface, logging transfers, and keeping balances.

Following the [example for unconditional payments](https://github.com/interledgerjs/ilp-plugin-payment-channel-framework#example-code-with-unconditional-payment-based-settlement), we do this by calling the `makePaymentChannelPlugin` function, passing in an object which implements the [Payment Channel Module API](https://github.com/interledgerjs/ilp-plugin-payment-channel-framework#payment-channel-module-api).

This returns an instance of [LedgerPlugin](https://github.com/interledger/rfcs/blob/master/0004-ledger-plugin-interface/0004-ledger-plugin-interface.md#class-ledgerplugin)!