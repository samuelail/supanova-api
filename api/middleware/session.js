const TokenGenerator = require('../general/TokenGenerator')
const db_helper = require('../general/db-helper')
const crypto = require('crypto');

exports.vaidate_token = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    try {
        if (!token) {
            return res.status(401).json({
                status: 'auth_error',
                message: 'Access token is required.'
            });
        }

        const decoded = TokenGenerator.verifyAccessToken(token);

        const user = await db_helper.getUser(decoded.userId)
        if (!user) {
            return res.status(401).json({
                status: 'auth_error',
                message: 'There was an issue finding an account associated with the provided access token.'
            })
        } 
        //Check if user has been marked for deletion
        if (user.marked_for_deletion === 1) {
            return res.status(401).json({
                status: 'auth_error',
                message: 'This user has been removed and is no longer available.'
            }); 
        }

        //Check if user has been suspended
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            status: 'auth_error',
            message: 'Invalid or expired access token.'
        });
    }
}


exports.validate_signature = async (req, res, next) => {
    try {
      // Extract the signature from headers
      const deviceId  = req.header('X-Device-UUID');
      const timestamp = req.header('X-Timestamp');
      const signature = req.header('X-Signature');
      const bodyHash = req.header('X-Body-Hash') || '';
  
      if (!signature) {
        console.log('NO SIGNATURE')
        return res.status(401).json({
          status: 'auth_error',
          message: 'Signature is missing.'
        });
      }
      //console.log(deviceId)
  
      if (!timestamp || !deviceId) {
        console.log('NO TIMESTAMP OR DEVICE ID')
        return res.status(400).json({
          status: 'auth_error',
          message: 'Timestamp and deviceId are required in payload.'
        });
      }

      let payload = {};
      if (req.method !== 'GET') {
        // Then assume the payload is in req.body.payload
        payload = req.body || {};
      } else {
        payload = req.query || {}
      }
  
      // Verify timestamp is within acceptable range (5 seconds)
      const currentTime = Math.floor(Date.now() / 1000);
      const timeWindow = 10; // 10 seconds
      if (Math.abs(currentTime - timestamp) > timeWindow) {
        console.log('REQUEST HAS EXPIRED')
        return res.status(400).json({
          status: 'auth_error',
          message: 'Request has expired.'
        });
      }
  
      // Get the secret key for this device (database call)
      const device = await db_helper.getUser(null, null, null, deviceId)
      if (!device) {
        console.log('INVALID DEVICE ID')
        return res.status(401).json({
          status: 'auth_error',
          message: 'Invalid device ID.'
        });
      }
  
      // Build the signature string to match Swift code EXACTLY
      // Format:  endpoint:method:sortedPayloadJSON:timestamp
      // e.g. "/api/v1/foo:POST:{\"deviceId\":\"1234\",\"timestamp\":16754321} : 16754321"
      const endpoint = req.path;    // e.g. "/api/v1/foo"
      const method = req.method;    // e.g. "POST"
      
      // Sort JSON keys in `payload` to match Swift's .sortedKeys
      const sortedKeys = Object.keys(payload).sort();
      const sortedPayload = {};
      sortedKeys.forEach(k => (sortedPayload[k] = payload[k]));
      const jsonString = stringifyWithoutEscapedSlashes(sortedPayload);
  
      // Build the string to sign
      const signatureString = `${endpoint}:${timestamp}:${deviceId}:${jsonString}`;


  
      // Generate the expected HMAC using the device's secretKey
      const hmac = crypto.createHmac('sha256', device.license_key);
      hmac.update(signatureString);
      const expectedSignature = hmac.digest('base64');
      //console.log(signatureString)
      //console.log("Expected Signature ",expectedSignature)
  
      // Compare signatures in constant time
      if (!crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )) {
        console.log('INVALID SIGNATURE')
        return res.status(401).json({
          status: 'auth_error',
          message: 'Invalid signature.'
        });
      }
  
      // If valid, attach payload/device to req for the next handler
      req.user = device
  
      next();
    } catch (error) {
      console.error('Signature validation error:', error);
      return res.status(400).json({
        status: 'auth_error',
        message: 'Error validating request signature.'
      });
    }
};

function stringifyWithoutEscapedSlashes(object) {
    // 1. Convert to JSON
    const rawJson = JSON.stringify(object);
    // 2. Remove the backslash before slashes
    //    This turns any '\/' into '/' 
    return rawJson.replace(/\\\//g, '/');
  }