const debug = require(`debug`)(`ilp-plugin-starling`)

const {
  makePaymentChannelPlugin,
  Errors,
} = require(`ilp-plugin-payment-channel-framework`)
//const Network = require('some-example-network')
const Starling = require(`starling-developer-sdk`)
const BigNumber = require(`bignumber.js`)

module.exports = makePaymentChannelPlugin({
  pluginName: `starling`,

  // initialize fields and validate options in the constructor
  constructor: function(ctx, opts) {
    // In this type of payment channel module, we create a log of incoming
    // settlements to track all the transfers sent to us on the ledger we're
    // using for settlement.  We use a transferLog in order to make sure a
    // single transfer can't be added twice.
    ctx.state.incomingSettlements = ctx.backend.getTransferLog(
      `incoming_settlements`
    )

    // The amount settled is used to track how much we've paid out in total.
    // We'll go deeper into how it's used in the `createOutgoingClaim`
    // function.
    ctx.state.amountSettled = ctx.backend.getMaxValueTracker(`amount_settled`)

    // In this type of payment channel backend, the unsecured balance we want
    // to limit is the total amount of incoming transfers minus the sum of all
    // the settlement transfers we've received.
    ctx.state.maxUnsecured = opts.maxUnsecured

    // use some preconfigured secret for authentication
    ctx.state.authToken = opts.authToken
  },

  connect: async function(ctx, opts) {
    const authToken = opts.authToken || ctx.state.authToken
    if (!authToken) {
      throw new Errors.InvalidFieldsError(`Auth token not defined`)
    }
    let whoAmI
    try {
      ctx.state.client = new Starling({ accessToken: authToken })
      whoAmI = await Starling.getMe()
    } catch (err) {
      throw new Errors.NotAcceptedError(`Auth token not accepted: `, err)
    }

    ctx.state.prefix = `g.dev.uk.starling.`
    ctx.state.account = whoAmI.customerUid

    // https://interledger.org/rfcs/0004-ledger-plugin-interface/#class-ledgerinfo
    ctx.state.info = {
      prefix: ctx.state.prefix,
      currencyCode: `GBP`,
      currencyScale: 0,
      connectors: [],
    }
  },

  disconnect: function() {
    Promise.resolve()
  },

  // Synchronous functions in order to get metadata. They won't be called until
  // after the plugin is connected.
  getAccount: ctx => ctx.state.prefix + ctx.state.account,
  getInfo: ctx => ctx.state.info,

  handleIncomingPrepare: async function(ctx, transfer) {
    const incoming = await ctx.transferLog.getIncomingFulfilledAndPrepared()

    // Instead of getting the best claim, we're getting the sum of all our
    // incoming settlement transfers. This tells us how much incoming money has
    // been secured.
    const amountReceived = await ctx.state.incomingSettlements.getIncomingFulfilledAndPrepared()

    // The peer can default on 'incoming - amountReceived', so we want to limit
    // that amount.
    const exceeds = new BigNumber(incoming)
      .subtract(amountReceived)
      .greaterThan(ctx.state.maxUnsecured)

    if (exceeds) {
      throw new Errors.NotAcceptedError(
        transfer.id + ` exceeds max unsecured balance`
      )
    }
  },

  // Even though this function is designed for creating a claim, we can
  // very easily repurpose it to make a payment for settlement.
  createOutgoingClaim: async function(ctx, outgoingBalance) {
    // If a new max value is set, the maxValueTracker returns the previous max
    // value. We tell the maxValueTracker that we're gonna pay the entire
    // outgoingBalance we owe, and then look at the difference between the last
    // balance and the outgoingBalance to determine how much to pay.
    // If we've already paid out more than outgoingBalance, then it won't be the
    // max value. The maxValueTracker will return outgoingBalance as the result,
    // and outgoingBalance - outgoingBalance is 0. Therefore, we send no payment.
    const lastPaid = await ctx.state.amountSettled.setIfMax({
      value: outgoingBalance,
      data: null,
    })
    const diff = new BigNumber(outgoingBalance).sub(lastPaid.value)

    if (diff.lessThanOrEqualTo(`0`)) {
      return
    }

    // We take the transaction ID from the payment we send, and give it as an
    // identifier so our peer can look it up on the network and verify that we
    // paid them. Another approach could be to return nothing from this
    // function, and have the peer automatically track all incoming payments
    // they're notified of on the settlement ledger.
    const txid = await Network.makePaymentToPeer(diff)

    return { txid }
  },

  handleIncomingClaim: async function(ctx, claim) {
    const { txid } = claim
    const payment = await Network.getPayment(txid)

    if (!payment) {
      return
    }

    // It doesn't really matter whether this is fulfilled or not, we just need
    // it to affect the incoming balance so we know how much has been received.
    // We use the txid as the ID of the incoming payment, so it's impossible to
    // apply the same incoming settlement transfer twice.
    await ctx.state.incomingSettlements.prepare(
      {
        id: txid,
        amount: payment.amount,
      },
      true
    ) // isIncoming: true
  },
})
