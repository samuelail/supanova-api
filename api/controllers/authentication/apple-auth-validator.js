const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');

class AppleAuthValidator {
    constructor(config) {
        this.config = {
            clientId: config.clientId, // Your Apple Service ID
            teamId: config.teamId,     // Your Apple Team ID
            keyId: config.keyId,       // Your Key ID from Apple
            privateKey: config.privateKey, // Your private key from Apple
            redirectUri: config.redirectUri
        };

        // Initialize JWKS client for verifying Apple's public keys
        this.jwksClient = jwksClient({
            jwksUri: 'https://appleid.apple.com/auth/keys',
            cache: true,
            cacheMaxAge: 86400000, // 24 hours
        });
    }

    // Get signing key from Apple's JWKS
    async getSigningKey(kid) {
        return new Promise((resolve, reject) => {
            this.jwksClient.getSigningKey(kid, (err, key) => {
                if (err) {
                    reject(err);
                    return;
                }
                const signingKey = key.getPublicKey();
                resolve(signingKey);
            });
        });
    }

    // Verify the identity token from Apple
    async verifyIdToken(idToken) {
        try {
            // Decode the JWT header to get the key ID (kid)
            const decoded = jwt.decode(idToken, { complete: true });
            if (!decoded || !decoded.header || !decoded.header.kid) {
                throw new Error('Invalid token format');
            }

            // Get the public key from Apple's JWKS
            const publicKey = await this.getSigningKey(decoded.header.kid);

            // Verify the token
            const verified = jwt.verify(idToken, publicKey, {
                algorithms: ['RS256'],
                issuer: 'https://appleid.apple.com',
                audience: this.config.clientId
            });

            return {
                isValid: true,
                payload: verified
            };
        } catch (error) {
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    // Validate authorization code and get tokens
    async validateAuthorizationCode(code) {
        try {
            const clientSecret = this.generateClientSecret();

            const response = await axios.post('https://appleid.apple.com/auth/token', {
                client_id: this.config.clientId,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: this.config.redirectUri
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return {
                success: true,
                tokens: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Generate client secret
    generateClientSecret() {
        const now = Math.floor(Date.now() / 1000);
        const clientSecret = jwt.sign({
            iss: this.config.teamId,
            iat: now,
            exp: now + 86400 * 180, // 6 months
            aud: 'https://appleid.apple.com',
            sub: this.config.clientId
        }, this.config.privateKey, {
            algorithm: 'ES256',
            header: {
                kid: this.config.keyId,
                typ: undefined // remove typ header
            }
        });

        return clientSecret;
    }

    // Refresh access token
    async refreshToken(refreshToken) {
        try {
            const clientSecret = this.generateClientSecret();

            const response = await axios.post('https://appleid.apple.com/auth/token', {
                client_id: this.config.clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return {
                success: true,
                tokens: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }
}

module.exports = AppleAuthValidator;