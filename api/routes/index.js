const express = require('express')
const router = express.Router();
const auth = require('../controllers/authentication/index')
const session = require('../middleware/session')
const user = require('../controllers/user/index')
const iap = require('../controllers/webhooks/iap')
const payments = require('../controllers/payments/index')

//AUTHENTICATION
// router.post('/auth/sign-in', auth.sign_in)

// router.post('/auth/sign-up', auth.sign_up)

// router.post('/auth/refresh', auth.refresh_token)

// router.post('/auth/apple', auth.apple_auth)

// router.post('/auth/google', auth.google_auth)

// router.post('/auth/verify-magic-link', auth.verify_magic_link)

// router.post('/auth/forgot-password', auth.forgot_password)

// router.post('/auth/reset-password', auth.reset_password)

//USER MANAGEMENT
router.get('/connect',session.validate_signature,  user.ping)

//router.put('/me', session.vaidate_token, user.update_profile)

//router.delete('/me', session.vaidate_token, user.delete_account)

//router.post('/notification/id', session.vaidate_token, user.store_onesignal_id)

//router.get('/flags', session.vaidate_token, user.get_feature_flags)

router.post('/license/activate',session.validate_signature, user.register_device)

//PAYMENTS
// router.post('/payments/iap', session.vaidate_token, payments.verify_receipt)

// router.post('/payments/intent', session.vaidate_token, payments.stripe_payment_intent)

//AI
router.post('/user/query', user.query)


//WEBHOOK HANDLERS
router.post('/webhook/iap', iap.handle_webhook)
module.exports = router;