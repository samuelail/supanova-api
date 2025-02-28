const jwt = require('jsonwebtoken');
const db_helper = require('../../general/db-helper')
//This is where we will also send push notificatons to the platform owner

class AppleNotificationDecoder {
    /**
     * Decode the signed payload without certificate verification
     * @param {string} decodedPayload - The signed payload from Apple
     * @returns {Object} Decoded notification data
     */
    decodeNotification(decodedPayload) {
        try {
            if (!decodedPayload || !decodedPayload.data) {
                throw new Error('Invalid notification format');
            }

            // Extract relevant data
            const {
                notificationType,
                subtype,
                data,
                version,
                signedDate,
                environment
            } = decodedPayload;

            // Decode transaction info
            const transactionInfo = data.signedTransactionInfo ?
                jwt.decode(data.signedTransactionInfo) :
                null;

            // Decode renewal info if present
            const renewalInfo = data.signedRenewalInfo ?
                jwt.decode(data.signedRenewalInfo) :
                null;

            console.log(renewalInfo)

            // Return formatted notification data
            return {
                notificationType,
                subtype,
                environment,
                version,
                signedDate: new Date(signedDate),
                transactionInfo: transactionInfo ? {
                    originalTransactionId: transactionInfo.originalTransactionId,
                    transactionId: transactionInfo.transactionId,
                    productId: transactionInfo.productId,
                    purchaseDate: new Date(transactionInfo.purchaseDate),
                    expiresDate: new Date(transactionInfo.expiresDate),
                    type: transactionInfo.type,
                    inAppOwnershipType: transactionInfo.inAppOwnershipType
                } : null,
                renewalInfo: renewalInfo ? {
                    autoRenewProductId: renewalInfo.autoRenewProductId,
                    autoRenewStatus: renewalInfo.autoRenewStatus,
                    expirationIntent: renewalInfo.expirationIntent,
                    gracePeriodExpiresDate: renewalInfo.gracePeriodExpiresDate ?
                        new Date(renewalInfo.gracePeriodExpiresDate) :
                        null,
                    isInBillingRetryPeriod: renewalInfo.isInBillingRetryPeriod,
                    offerIdentifier: renewalInfo.offerIdentifier,
                    priceIncreaseStatus: renewalInfo.priceIncreaseStatus
                } : null
            };
        } catch (error) {
            throw new Error(`Failed to decode notification: ${error.message}`);
        }
    }

    /**
     * Handle different types of notifications
     * @param {Object} decodedNotification - The decoded notification
     */
    async handleNotificationType(decodedNotification) {
        const { notificationType, transactionInfo } = decodedNotification;

        switch (notificationType) {
            case 'SUBSCRIBED':
                return this.handleNewSubscription(decodedNotification);
            case 'DID_RENEW':
                return this.handleRenewal(decodedNotification);

            case 'DID_FAIL_TO_RENEW':
                return this.handleFailedRenewal(decodedNotification);

            case 'EXPIRED':
                return this.handleExpiration(decodedNotification);

            case 'DID_CHANGE_RENEWAL_STATUS':
                return this.handleRenewalStatusChange(decodedNotification);

            case 'REFUND':
                return this.handleRefund(decodedNotification);

            case 'DID_CHANGE_RENEWAL_PREF':
                return this.handleDidChangeRenewal(decodedNotification);

            case 'PRICE_INCREASE':
                return this.handlePriceIncrease(decodedNotification);

            case 'GRACE_PERIOD_EXPIRED':
                return this.handleGracePeriodExpired(decodedNotification);

            default:
                console.log(`Unhandled notification type: ${notificationType}`);
                return null;
        }
    }

    async handleNewSubscription(notification) {
        const { transactionInfo, renewalInfo } = notification;
        console.log('New subscription:', {
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId,
            purchaseDate: transactionInfo.purchaseDate,
            expiresDate: transactionInfo.expiresDate
        });
        //This is handled directly in the request from the client
    }

    async handleRenewal(notification) {
        const { transactionInfo } = notification;
        console.log('Subscription renewed:', {
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId,
            expiresDate: transactionInfo.expiresDate
        });
        //Fetch the transaction 
        const subscription = await db_helper.getSubscription(transactionInfo.originalTransactionId, 'original_transaction_id')
        if (subscription) {
            const user_id = subscription.user_id
            await db_helper.updateSubscription(user_id, {
                status: 'active',
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId,
            })
        }
        //We should not handle new transactions here.
    }

    async handleFailedRenewal(notification) {
        const { transactionInfo, renewalInfo } = notification;
        console.log('Renewal failed:', {
            productId: transactionInfo.productId,
            expirationIntent: renewalInfo.expirationIntent,
            isInBillingRetryPeriod: renewalInfo.isInBillingRetryPeriod
        });

        const subscription = await db_helper.getSubscription(transactionInfo.originalTransactionId, 'original_transaction_id')
        if (subscription) {
            const user_id = subscription.user_id
            await db_helper.updateSubscription(user_id, {
                status: renewalInfo.isInBillingRetryPeriod ? 'grace_period' : 'expired',
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId,
                auto_renew_status: renewalInfo.autoRenewStatus
            })
        }
    }

    async handleExpiration(notification) {
        const { transactionInfo } = notification;
        console.log('Subscription expired:', {
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId
        });
        const subscription = await db_helper.getSubscription(transactionInfo.originalTransactionId, 'original_transaction_id')
        if (subscription) {
            const user_id = subscription.user_id
            await db_helper.updateSubscription(user_id, {
                status: 'expired',
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId,
            })
        }
    }

    async handleRenewalStatusChange(notification) {
        const { transactionInfo } = notification;
        console.log('Renewal status changed:', {
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId
        });
        const subscription = await db_helper.getSubscription(transactionInfo.originalTransactionId, 'original_transaction_id')
        if (subscription) {
            const user_id = subscription.user_id
            await db_helper.updateSubscription(user_id, {
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId,
                auto_renew_status: transactionInfo.pendingRenewalInfo?.[0]?.auto_renew_status === '1' ? 1 : 0,
            })
        }
    }

    async handleDidChangeRenewal(notification) {
        const { transactionInfo, renewalInfo } = notification;
        console.log('Did change renewal:', {
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId
        });

        const subscription = await db_helper.getSubscription(transactionInfo.originalTransactionId, 'original_transaction_id')
        if (subscription) {
            const user_id = subscription.user_id
            await db_helper.updateSubscription(user_id, {
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId,
                product_id: renewalInfo.autoRenewProductId
            })
        }
    }

    async handleRefund(notification) {
        const { transactionInfo } = notification;
        console.log('Transaction refunded:', {
            productId: transactionInfo.productId,
            transactionId: transactionInfo.transactionId
        });
        const subscription = await db_helper.getSubscription(transactionInfo.originalTransactionId, 'original_transaction_id')
        if (subscription) {
            const user_id = subscription.user_id
            await db_helper.updateSubscription(user_id, {
                status: 'cancelled',
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId,
            })
        }
    }

    async handlePriceIncrease(notification) {
        const { transactionInfo } = notification;
        const subscription = await db_helper.getSubscription(
            transactionInfo.originalTransactionId,
            'original_transaction_id'
        );

        if (subscription) {
            // Maybe send notification to user
            // Update price increase consent status
        }
    }

    async handleGracePeriodExpired(notification) {
        const { transactionInfo } = notification;
        const subscription = await db_helper.getSubscription(
            transactionInfo.originalTransactionId,
            'original_transaction_id'
        );

        if (subscription) {
            const user_id = subscription.user_id;
            await db_helper.updateSubscription(user_id, {
                status: 'expired',
                expires_date: new Date(transactionInfo.expiresDate),
                original_transaction_id: transactionInfo.originalTransactionId
            });
        }
    }
}

module.exports = AppleNotificationDecoder;