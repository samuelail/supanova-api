const jwt = require('jsonwebtoken');
const AppleNotificationDecoder = require('./apple-notification-decoder');
const decoder = new AppleNotificationDecoder();

exports.handle_webhook = async (req, res) => {
    // Always respond to Apple quickly
    res.sendStatus(200);

    try {
        const { signedPayload } = req.body;

        // 1. First verify signature
        const decoded = jwt.decode(signedPayload, { complete: true });
        if (!decoded || !decoded.header || !decoded.header.x5c) {
            console.error('Invalid JWT or missing Apple certificate chain');
            return;
        }

        // Get Apple's certificate and verify
        const appleCert = `-----BEGIN CERTIFICATE-----\n${decoded.header.x5c[0]}\n-----END CERTIFICATE-----`;
        const verifiedPayload = jwt.verify(signedPayload, appleCert, { 
            algorithms: ['ES256']
        });

        // 2. Now that we've verified it's from Apple, decode and process
        const decodedNotification = decoder.decodeNotification(verifiedPayload);
        
        // console.log('Verified and decoded notification:', 
        //     JSON.stringify(decodedNotification, null, 2)
        // );

        // 3. Handle the notification type
        await decoder.handleNotificationType(decodedNotification);

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            console.error('Invalid signature - request not from Apple:', error);
        } else {
            console.error('Error processing webhook:', error);
        }
    }
};