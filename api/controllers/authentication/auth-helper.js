const axios = require('axios');
const verifyAppleToken = require("verify-apple-id-token").default;
const nodemailer = require("nodemailer");
const domains = require('disposable-email-domains');

module.exports = {
    isValidEmail(email) {
        const emailRegex = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
        // Basic input validation
        if (!email || typeof email !== 'string') {
            return false;
        }
        // Remove leading/trailing whitespace
        email = email.trim();
        // Check if email matches the regex pattern
        return emailRegex.test(email);
    },
    isDisposableEmail(email) {
        // Extract the domain from the email
        const domain = email.split('@')[1]?.toLowerCase();
        // If we can't extract a domain, return false. This will likely not happen because we are validating the email using regex
        if (!domain) return false;
        return domains.includes(domain);
    },
    async exchangeGoogleAuthCode(authCode) {
        try {
            const response = await axios({
                method: 'post',
                url: 'https://oauth2.googleapis.com/token',
                headers: {
                    'Content-Type': 'application/json'
                },
                data: {
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    code: authCode,
                    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
                    grant_type: 'authorization_code'
                }
            });

            return response.data;
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw error;
        }
    },
    async getGoogleUserInfo(accessToken) {
        try {
            const response = await axios({
                method: 'get',
                url: 'https://www.googleapis.com/oauth2/v1/userinfo',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            return response.data;
        } catch (error) {
            console.error('User info error:', error.response?.data || error.message);
            throw error;
        }
    },
    async exchangeAppleIdToken(token) {
        try {
            const jwtClaims = await verifyAppleToken({
                idToken: token,
                clientId: process.env.BUNDLE_ID,
            });
            return jwtClaims
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw error;
        }
    },
    generateSecurePassword(length = 12) {
        const upperCaseLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowerCaseLetters = 'abcdefghijklmnopqrstuvwxyz';
        const numbers = '0123456789';
        const specialCharacters = '!@#$%^&*()-_=+[]{}|;:,.<>?';
        const allCharacters = upperCaseLetters + lowerCaseLetters + numbers + specialCharacters;
    
        if (length < 8) {
            throw new Error("Password length should be at least 8 characters for security.");
        }
    
        let password = '';
    
        // Ensure at least one character from each category
        password += upperCaseLetters[Math.floor(Math.random() * upperCaseLetters.length)];
        password += lowerCaseLetters[Math.floor(Math.random() * lowerCaseLetters.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += specialCharacters[Math.floor(Math.random() * specialCharacters.length)];
    
        // Fill the remaining length with random characters from all categories
        for (let i = password.length; i < length; i++) {
            password += allCharacters[Math.floor(Math.random() * allCharacters.length)];
        }
    
        // Shuffle the password to remove predictable patterns
        password = password.split('').sort(() => Math.random() - 0.5).join('');
    
        return password;
    },
    isUserSuspended(suspendedTill) {
        // Check if the suspendedTill field is not null and in the future
        if (suspendedTill) {
            const suspensionDate = new Date(suspendedTill);
            const currentDate = new Date();
            if (suspensionDate > currentDate) {
                return true; // User is suspended
            }
        }
        return false; // User is not suspended
    },
    async sendMagicLink(email, link) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: 465,
                secure: true, // true for port 465, false for other ports
                auth: {
                  user: process.env.SMTP_USERNAME,
                  pass: process.env.SMTP_PASSWORD,
                },
              });

              const info = await transporter.sendMail({
                from: `"${process.env.APP_NAME}" <${process.env.SMTP_USERNAME}>`,
                to: email,
                subject: "Complete Your Authentication",
                text: `Click this link to complete your authentication: ${link}`, // Plain text fallback
                html: `
                    <html>
                        <body style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #2d3748;">Complete Your Authentication</h2>
                            <p>Click the button below to complete your authentication for ${process.env.APP_NAME}:</p>
                            
                            <div style="margin: 30px 0;">
                                <a href="${link}" 
                                   style="background-color: #6D28D9; 
                                          color: white; 
                                          padding: 12px 24px; 
                                          text-decoration: none; 
                                          border-radius: 5px; 
                                          display: inline-block;">
                                    Sign In
                                </a>
                            </div>
                            
                            <p style="color: #666; margin-top: 30px; font-size: 14px;">
                                If the button doesn't work, copy and paste this link into your browser:
                                <br>
                                <a href="${link}" style="color: #6D28D9; word-break: break-all;">
                                    ${link}
                                </a>
                            </p>
                            
                            <p style="color: #666; margin-top: 30px; font-size: 12px;">
                                This link will expire in 15 minutes for security reasons.
                                <br>
                                If you didn't request this email, please ignore it.
                            </p>
                        </body>
                    </html>
                `
            });
            
              console.log("Message sent: %s", info.messageId);
        } catch (error) {
            console.log(error)
        }
    },
    async sendPasswordResetEmail(email, link) {
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 465,
            secure: true, // true for port 465, false for other ports
            auth: {
              user: process.env.SMTP_USERNAME,
              pass: process.env.SMTP_PASSWORD,
            },
          });
      
          const info = await transporter.sendMail({
            from: `"${process.env.APP_NAME}" <${process.env.SMTP_USERNAME}>`,
            to: email,
            subject: "Reset Your Password",
            text: `Click this link to reset your password: ${link}`, // Plain text fallback
            html: `
              <html>
                <body style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                  <h2 style="color: #2d3748;">Reset Your Password</h2>
                  <p>Click the button below to reset your password for ${process.env.APP_NAME}:</p>
                  <div style="margin: 30px 0;">
                    <a href="${link}"
                      style="background-color: #6D28D9;
                      color: white;
                      padding: 12px 24px;
                      text-decoration: none;
                      border-radius: 5px;
                      display: inline-block;">
                      Reset Password
                    </a>
                  </div>
                  <p style="color: #666; margin-top: 30px; font-size: 14px;">
                    If the button doesn't work, copy and paste this link into your browser:
                    <br>
                    <a href="${link}" style="color: #6D28D9; word-break: break-all;">
                      ${link}
                    </a>
                  </p>
                  <p style="color: #666; margin-top: 30px; font-size: 12px;">
                    This link will expire in 15 minutes for security reasons.
                    <br>
                    If you didn't request this password reset, please ignore it.
                  </p>
                </body>
              </html>
            `
          });
      
          console.log("Message sent: %s", info.messageId);
          return info;
        } catch (error) {
          console.log(error);
          throw error;
        }
      }
}