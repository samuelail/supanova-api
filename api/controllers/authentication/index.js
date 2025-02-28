const bcrypt = require('bcrypt');
const saltRounds = 10; //Feel free to change the salt rounds
const auth_helper = require('./auth-helper')
const db_helper = require('../../general/db-helper')
const { v4: uuidv4 } = require('uuid');
const TokenGenerator = require('../../general/TokenGenerator')

exports.sign_up = async (req, res) => {
    try {
        const first_name = req.body.first_name
        const last_name = req.body.last_name
        const email = req.body.email_address
        const password = req.body.password
        const usr_id = `uid_${uuidv4()}`
        //Confirm that everything is provided
        if (!first_name || !last_name || !email || !password) {
            //Missing a required field
            return res.status(400).json({
                status: 'request_error',
                message: 'You need to provide a all the required information.'
            })
        }

        //Validate email address
        if (!auth_helper.isValidEmail(email)) {
            //Invalid email provided
            return res.status(400).json({
                status: 'invalid_request',
                message: 'The email address you have provided is invalid.'
            })
        }

        //Check db for email address
        const user = await db_helper.getUser(null, email)
        if (user) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'The email address already exists. Did you mean to sign in instead ?'
            })
        }

        //Save new user in db
        bcrypt.hash(password, saltRounds).then(async function (hash) {
            //Save hash instead of plain password
            await db_helper.createUser(usr_id, email, hash, first_name, last_name)
            return res.status(201).json({
                status: 'success',
                message: 'Account created successfully'
            })

        })

        //Optional, send welcome email, email verification email etc

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}

exports.sign_in = async (req, res) => {
    try {
        const email = req.body.email_address
        const password = req.body.password
        if (!email) { //Email is required but password is optional. In the event of no password, we will send a magic link.
            return res.status(400).json({
                status: 'request_error',
                message: 'You need to provide a valid email address.'
            })
        }
        //Optional, validate email address to make sure user is not passing in a malicious code
        if (!auth_helper.isValidEmail(email)) {
            //Invalid email provided
            return res.status(400).json({
                status: 'invalid_request',
                message: 'The email address you have provided is invalid.'
            })
        }

        if (auth_helper.isDisposableEmail(email)) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Disposable email addresses are not allowed'
            }) 
        }
        // //Get user from DB
        const user = await db_helper.getUser(null, email)
        if (!user) {
            //No user
            return res.status(400).json({
                status: 'invalid_request',
                message: 'The email address you have provided is invalid.'
            })
        }
        //Check ig account is marked for deletion
        if (user.marked_for_deletion === 1) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'This user has been removed and is no longer available.'
            });
        }

        //Check for account suspenion
        if (auth_helper.isUserSuspended(user.suspended_until)) {
            return res.status(400).json({
                status: 'user_suspended',
                message: 'Your account is currently suspended.'
            });
        }

        //Compare passwords if user exists
        if (password) {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                //login
                const tokens = TokenGenerator.generateTokens({
                    userId: user.user_id,
                    email: user.email_address,
                    role: 'user'
                });
                console.log(tokens)
                return res.status(200).json({
                    status: 'success',
                    message: '',
                    tokens: {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        accessTokenExpiry: tokens.accessTokenExpiry,
                        refreshTokenExpiry: tokens.refreshTokenExpiry
                    }
                })

            }
            //Passwords do not match
            return res.status(400).json({
                status: 'auth_error',
                message: 'Password incorrect.'
            })
        } else {
            //Passwordless signin option
            const token = TokenGenerator.generateMagicLinkToken({
                email: user.email_address,
                type: 'magic_link'
            })

            const link = `${process.env.APP_SCHEMA}app/confirm-auth?token=${token}`

            await auth_helper.sendMagicLink(user.email_address, link)

            return res.status(200).json({
                status: 'success',
                message: 'We sent a link to your email address to complete your authentication'
            })

        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}

exports.apple_auth = async (req, res) => {
    const auth_code = req.body.code
    const first_name = req.body.first_name
    const last_name = req.body.last_name
    try {
        if (!auth_code) {
            return res.status(400).json({
                status: 'request_error',
                message: 'You need to provide the Google auth code.'
            })
        }
        const decoded = await auth_helper.exchangeAppleIdToken(auth_code)
        const email_address = decoded.email
        const is_private_email = decoded.is_private_email
        const sub = decoded.sub
        /**
         * Apple auth is a little tricky because a user can opt to use apple's private email relay feature,
         * essentially looking like a brand new user. This is good for the user but not so good for developers.
         * In order to know if a user is unique, we need to look at the "sub" key .
         */

        if (is_private_email) {
            //You can decide to reject private emails here
            // return res.status(400).json({
            //     status: 'request_error',
            //     message: 'You need to disable private email relay.'
            // })
        }

        //Continue with auth
        //Check if we have an existing user with that sub id
        const user = await db_helper.getUser(null, null, sub)
        if (!user) {
            console.log('User does not exist')
            if (!first_name || !last_name) {
                return res.status(400).json({
                    status: 'request_error',
                    message: 'You need to provide a all the required information.'
                })
            }
            /**
             * Generate random secure password (So that the password field is not empty). 
             * If they choose to sign in with password in future, they'll need to reset the account password.
             */

            const password = auth_helper.generateSecurePassword(16) //Random secure password
            const usr_id = `uid_${uuidv4()}`
            bcrypt.hash(password, saltRounds).then(async function (hash) {
                //Save hash instead of plain password
                await db_helper.createUser(usr_id, email_address, hash, first_name, last_name)
                //Since this is a social auth, create a session so they can go straight in.
                await db_helper.updateUser(usr_id, {
                    "apple_sub_id": sub
                })
                const tokens = TokenGenerator.generateTokens({
                    userId: usr_id,
                    email: email_address,
                    role: 'user'
                });

                return res.status(200).json({
                    status: 'success',
                    message: '',
                    tokens: {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        accessTokenExpiry: tokens.accessTokenExpiry,
                        refreshTokenExpiry: tokens.refreshTokenExpiry
                    }
                })

            })

        } else {
            const tokens = TokenGenerator.generateTokens({
                userId: user.user_id,
                email: user.email_address,
                role: 'user'
            });

            return res.status(200).json({
                status: 'success',
                message: '',
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    accessTokenExpiry: tokens.accessTokenExpiry,
                    refreshTokenExpiry: tokens.refreshTokenExpiry
                }
            })
        }

    } catch (error) {
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}

exports.google_auth = async (req, res) => {
    const auth_code = req.body.code
    try {
        if (!auth_code) {
            return res.status(400).json({
                status: 'request_error',
                message: 'You need to provide the Google auth code.'
            })
        }

        const tokens = await auth_helper.exchangeGoogleAuthCode(auth_code);
        // Then get the user info using the access token
        const userInfo = await auth_helper.getGoogleUserInfo(tokens.access_token);
        console.log(userInfo)
        const user = await db_helper.getUser(null, userInfo.email)
        if (!user) {
            //Sign up
            const password = auth_helper.generateSecurePassword(16) //Random secure password
            const usr_id = `uid_${uuidv4()}`
            bcrypt.hash(password, saltRounds).then(async function (hash) {
                //Save hash instead of plain password
                await db_helper.createUser(usr_id, userInfo.email, hash, userInfo.given_name || '-', userInfo.family_name || '-')
                //Since this is a social auth, create a session so they can go straight in.
                const tokens = TokenGenerator.generateTokens({
                    userId: usr_id,
                    email: userInfo.email,
                    role: 'user'
                });

                return res.status(200).json({
                    status: 'success',
                    message: '',
                    tokens: {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        accessTokenExpiry: tokens.accessTokenExpiry,
                        refreshTokenExpiry: tokens.refreshTokenExpiry
                    }
                })

            })

        } else {
            //Sign in
            const tokens = TokenGenerator.generateTokens({
                userId: user.user_id,
                email: user.email_address,
                role: 'user'
            });

            return res.status(200).json({
                status: 'success',
                message: '',
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    accessTokenExpiry: tokens.accessTokenExpiry,
                    refreshTokenExpiry: tokens.refreshTokenExpiry
                }
            })
        }

    } catch (error) {
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}

exports.refresh_token = async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                status: 'request_error',
                message: 'Refresh token is required.'
            });
        }

        try {
            // First verify the refresh token and get decoded payload
            const decoded = TokenGenerator.verifyRefreshToken(refresh_token);

            // Get user to ensure they still exist and get latest data
            const user = await db_helper.getUser(decoded.userId);

            if (!user) {
                return res.status(401).json({
                    status: 'auth_error',
                    message: 'Invalid user.'
                });
            }

            // Generate new access token with additional user data
            const { accessToken, accessTokenExpiry } = TokenGenerator.refreshAccessToken(
                refresh_token,
                {
                    email: user.email_address,
                    role: 'user'
                }
            );

            return res.status(200).json({
                status: 'success',
                message: '',
                tokens: {
                    accessToken,
                    accessTokenExpiry
                }
            });

        } catch (tokenError) {
            console.log('Token verification failed:', tokenError);
            return res.status(401).json({
                status: 'auth_error',
                message: 'Invalid or expired refresh token.'
            });
        }

    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an error while processing your request.'
        });
    }
};

exports.verify_magic_link = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'Token is required.'
            });
        }

        // Verify the magic link token
        let decoded;
        try {
            decoded = TokenGenerator.verifyMagicLinkToken(token)
        } catch (error) {
            return res.status(400).json({
                status: 'invalid_token',
                message: 'Invalid or expired magic link.'
            });
        }

        // Verify user still exists and is active
        const user = await db_helper.getUser(decoded.email);
        if (!user) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'User not found.'
            });
        }

        if (user.marked_for_deletion === 1) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'This user has been removed.'
            });
        }

        if (auth_helper.isUserSuspended(user.suspended_until)) {
            return res.status(400).json({
                status: 'user_suspended',
                message: 'Your account is currently suspended.'
            });
        }

        // Generate auth tokens
        const tokens = TokenGenerator.generateTokens({
            userId: user.user_id,
            email: user.email_address,
            role: 'user'
        });

        return res.status(200).json({
            status: 'success',
            message: '',
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                accessTokenExpiry: tokens.accessTokenExpiry,
                refreshTokenExpiry: tokens.refreshTokenExpiry
            }
        });

    } catch (error) {
        console.error('Magic link verification error:', error);
        return res.status(500).json({
            status: 'internal_error',
            message: 'An error occurred while verifying the magic link.'
        });
    }
}

exports.forgot_password = async (req, res) => {
    try {
        const { email_address } = req.body;

        if (!email_address) {
            return res.status(400).json({
                status: 'request_error',
                message: 'You need to provide a valid email address.'
            })
        }

        const user = await db_helper.getUser(null, email_address)
        if (!user) {
            return res.status(400).json({
                status: 'request_error',
                message: 'No account found with this email'
            })
        }

        if (user.marked_for_deletion === 1) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'This user has been removed.'
            });
        }

        if (auth_helper.isUserSuspended(user.suspended_until)) {
            return res.status(400).json({
                status: 'user_suspended',
                message: 'Your account is currently suspended.'
            });
        }


        const resetToken = TokenGenerator.generateMagicLinkToken({
            userId: user.user_id,
            email: user.email_address,
            timestamp: Date.now()
        });

        const link = `${process.env.APP_SCHEMA}app/reset-password?token=${resetToken}`

        await auth_helper.sendPasswordResetEmail(user.email_address, link)

        return res.status(200).json({
            status: 'success',
            message: 'We sent a link to your email address to complete your authentication'
        })
    } catch (error) {
        console.error('Magic link verification error:', error);
        return res.status(500).json({
            status: 'internal_error',
            message: 'An error occurred while verifying the magic link.'
        });
    }
}

exports.reset_password = async (req, res) => {
    try {
        const { password, token } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                status: 'request_error',
                message: 'You need to provide a all the required information.'
            })
        }

        let decoded;
        try {
            decoded = TokenGenerator.verifyMagicLinkToken(token)
        } catch (error) {
            return res.status(400).json({
                status: 'invalid_token',
                message: 'Invalid or expired magic link.'
            });
        }

        const user = await db_helper.getUser(decoded.userId);

        if (!user) {
            return res.status(404).json({
                status: 'not_found',
                message: 'User not found.'
            });
        }

        if (user.marked_for_deletion === 1) {
            return res.status(400).json({
                status: 'invalid_request',
                message: 'This user has been removed.'
            });
        }

        if (auth_helper.isUserSuspended(user.suspended_until)) {
            return res.status(400).json({
                status: 'user_suspended',
                message: 'Your account is currently suspended.'
            });
        }

        // Only do the timestamp comparison if password_last_changed exists
        if (user.password_last_changed) {
            // Convert both times to UTC timestamps for comparison
            const tokenIssuedAt = new Date(decoded.iat * 1000);
            const lastPasswordChange = new Date(user.password_last_changed + 'Z'); // Adding Z to treat as UTC

            console.log('Token issued (UTC):', tokenIssuedAt.toISOString());
            console.log('Last password change (UTC):', lastPasswordChange.toISOString());

            // Compare UTC timestamps
            if (lastPasswordChange.getTime() > tokenIssuedAt.getTime()) {
                return res.status(400).json({
                    status: 'not_found',
                    message: 'This reset link has already been used'
                });
            }
        }

        // For new timestamp, create in UTC
        const nowUTC = new Date().toISOString()
            .slice(0, 19)
            .replace('T', ' ');


        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);
        const updates = {
            password: hashedPassword,
            password_last_changed: nowUTC
        };

        await db_helper.updateUser(decoded.userId, updates);

        return res.status(200).json({
            status: 'success',
            message: 'Your password has been successfully reset'
        })

    } catch (error) {
        console.error('Magic link verification error:', error);
        return res.status(500).json({
            status: 'internal_error',
            message: 'An error occurred while verifying the magic link.'
        });
    }
}