const appleReceiptVerify = require('node-apple-receipt-verify');
const { ERROR_CODES } = require('node-apple-receipt-verify');

module.exports = {
    async verifyReceipt(receiptData) {
        appleReceiptVerify.config({
            secret: process.env.APPLE_RECEIPT_SECRET,
            environment: [process.env.APPLE_RECEIPT_ENVIRONMENT], // 'production' or 'sandbox'
            verbose: false,
            extended: true,
            ignoreExpired: true,
        });
        try {
            const validationResponse = await appleReceiptVerify.validate({ receipt: receiptData.trim() });
            return validationResponse;
        } catch (error) {
            console.error("Receipt verification failed:", error);
            
            switch (error.appleStatus) {
                case ERROR_CODES.INVALID_RECEIPT_DATA:
                    console.error("The data in the receipt-data property was malformed or missing.");
                    break;
                case ERROR_CODES.TEST_RECEIPT:
                    console.error("This is a sandbox receipt sent to production environment.");
                    break;
                case ERROR_CODES.PROD_RECEIPT:
                    console.error("This is a production receipt sent to sandbox environment.");
                    break;
                case ERROR_CODES.COULD_NOT_AUTHENTICATE:
                    console.error("The receipt could not be authenticated.");
                    break;
                case ERROR_CODES.INVALID_SECRET:
                    console.error("The shared secret is invalid.");
                    break;
            }
            throw error;
        }
    },
}