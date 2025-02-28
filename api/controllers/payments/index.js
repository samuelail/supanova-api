const subscription_helper = require('./subscription-helper')
const db_helper = require('../../general/db-helper')
const stripe = require('stripe')(process.env.STRIPE_SK);

exports.verify_receipt = async (req, res) => {
    const receipt_data = req.body.receipt
    const transaction_id = req.body.transaction_id
    const userInfo = req.user
    try {
        if (!receipt_data || !transaction_id) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'The purchase payload is incomplete'
            })
        }

        const receipt = await subscription_helper.verifyReceipt(receipt_data)
        const transaction = receipt.find(t => t.transactionId === transaction_id);
        if (!transaction) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Transaction not found'
            })
        }

        console.log(transaction)
        const purchaseTimestamp = parseInt(transaction.purchaseDate);
        const now = Date.now();
        const oneMinuteAgo = now - (1 * 60 * 1000); // 1 minute in milliseconds
        if (purchaseTimestamp < oneMinuteAgo) {
            console.log('expired')
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Transaction too old'
            })
        }

        //If you plan to also accept one time payments, you can decide to change your processing logic here
        const result = await db_helper.updateSubscription(
            userInfo.user_id,
            {
                status: 'active',
                product_id: transaction.productId,
                original_transaction_id: transaction.originalTransactionId,
                latest_transaction_id: transaction.transactionId,
                // Ensure valid date handling
                purchase_date: new Date(transaction.purchaseDate),
                expires_date: new Date(transaction.expirationDate),
                // Better auto-renewal check
                auto_renew_status: transaction.pendingRenewalInfo?.[0]?.auto_renew_status === '1' ? 1 : 0,
                environment: ['production', 'sandbox'].includes(transaction.environment?.toLowerCase())
                    ? transaction.environment.toLowerCase()
                    : 'unknown',
                platform: 'ios'
            }
        );

        console.log(result)

        return res.status(200).json({
            status: 'success',
            message: 'Purchase verified successfully.',
            transaction: {
                transactionId: transaction_id
            }
        })

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}

exports.stripe_payment_intent = async (req, res) => {
    const amount = req.body.amount
    const currency = req.body.currency
    const userInfo = req.user
    try {
        if (!amount || !currency) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Amount and currency are required'
            });
        }
        
        if (typeof(amount) !== 'number' || !Number.isInteger(amount)) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Amount must be an integer'
            });
        }
        
        if (typeof(currency) !== 'string') {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Currency must be a string'
            });
        }
        //Pull customer_id from db if available
        const customer = userInfo.stripe_customer_id || await stripe.customers.create();
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2024-09-30.acacia' }
        );
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            customer: customer.id,
            // In the latest version of the API, specifying the `automatic_payment_methods` parameter
            // is optional because Stripe enables its functionality by default.
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return res.status(200).json({
            status: 'success',
            message: '',
            intent: {
                paymentIntent: paymentIntent.client_secret,
                ephemeralKey: ephemeralKey.secret,
                customer: customer.id,
                publishableKey: process.env.STRIPE_PK
            }
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}