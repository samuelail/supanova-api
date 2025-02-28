const jwt = require('jsonwebtoken');

// Configuration constants
const config = {
    jwt: {
        accessToken: {
            expiresIn: '15m', // Short lived
        },
        refreshToken: {
            expiresIn: '7d', // Longer lived
        }
    }
};

class TokenGenerator {
    /**
     * Generates both access and refresh tokens
     * @param {Object} payload - User data to encode in tokens
     * @returns {Object} Object containing both tokens and their expiry times
     */
    static generateTokens(payload) {
        // Strip sensitive info from refresh token payload
        const refreshPayload = {
            userId: payload.userId,
        };
        console.log(config.jwt)

        // Generate tokens
        const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
            expiresIn: config.jwt.accessToken.expiresIn
        });

        const refreshToken = jwt.sign(refreshPayload, process.env.JWT_REFRESH_SECRET, {
            expiresIn: config.jwt.refreshToken.expiresIn
        });

        // Get expiry times
        const accessTokenExpiry = jwt.decode(accessToken).exp;
        const refreshTokenExpiry = jwt.decode(refreshToken).exp;

        return {
            accessToken,
            refreshToken,
            accessTokenExpiry,
            refreshTokenExpiry
        };
    }

    /**
     * Verifies an access token
     * @param {string} token - The token to verify
     * @returns {Object} Decoded token payload
     */
    static verifyAccessToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        } catch (error) {
            throw new Error('Invalid access token');
        }
    }

    /**
     * Verifies a refresh token
     * @param {string} token - The token to verify
     * @returns {Object} Decoded token payload
     */
    static verifyRefreshToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }

    /**
     * Refreshes an access token using a refresh token
     * @param {string} refreshToken - The refresh token to use
     * @param {Object} additionalPayload - Additional data to include in new access token
     * @returns {Object} New access token and its expiry
     */
    static refreshAccessToken(refreshToken, additionalPayload = {}) {
        try {
            // Verify the refresh token
            const decoded = this.verifyRefreshToken(refreshToken);

            // Create new payload for access token
            const payload = {
                userId: decoded.userId,
                ...additionalPayload
            };

            // Generate new access token
            const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
                expiresIn: config.jwt.accessToken.expiresIn
            });

            const accessTokenExpiry = jwt.decode(accessToken).exp;

            return {
                accessToken,
                accessTokenExpiry
            };
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }

    /**
     * Generates a token to be used for magic links
     * @param {Object} payload - User data to encode in tokens
     */
    static generateMagicLinkToken(payload) {
        return jwt.sign(payload, process.env.MAGIC_LINK_SECRET, {
            expiresIn: '15m'
        });
    }

    /**
 * Generates a token to be used for magic links
 * @param {Object} payload - User data to encode in tokens
 */
    static verifyMagicLinkToken(token) {
        try {
            return jwt.verify(token, process.env.MAGIC_LINK_SECRET);
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }
}

module.exports = TokenGenerator;