const stripe = require('stripe')(process.env.STRIPE_SK);
const { v4: uuidv4 } = require('uuid');

exports.handle_subscription = async (req, res) => {
    let event
    res.sendStatus(200);

    try {
        const signature = req.headers.get('stripe-signature');

        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;

            case 'invoice.payment_failed':
                await handleInvoicePaymentFailed(event.data.object);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(event.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;

            case 'invoice.upcoming':
                await handleUpcomingInvoice(event.data.object);
                break;

            case 'customer.updated':
                await handleCustomerUpdated(event.data.object);
                break;

            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        // Consider implementing a retry mechanism or alerting system here
    }
};

async function handleCheckoutSessionCompleted(session) {
    if (session.mode === 'subscription') {
        console.log(`Handle New subscription`);
    } else {
        console.log(`Handle New single payment`);
    }
}

async function handleInvoicePaymentFailed(invoice) {
    const { subscription: subscriptionId, customer: customerId } = invoice;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    console.log('Subscription payment failed:', { customerId, subscriptionId, subscriptionDetails: subscription });
    // Handle failed payment (e.g., notify user, adjust account status)
}

async function handleInvoicePaid(invoice) {
    if (invoice.billing_reason === 'subscription_cycle') {
        const { customer: customerId, subscription: subscriptionId } = invoice;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const plan = subscription.plan
        const product = plan.product;
        console.log('Subscription payment succeeded:', { customerId, subscriptionId, subscriptionDetails: subscription });
    }
}

async function handleSubscriptionUpdated(subscription) {
    const { id: subscriptionId, customer: customerId, status } = subscription;
    console.log('Subscription updated:', { customerId, subscriptionId, status });
    // Handle subscription updates (e.g., plan changes, cancellations)
}

async function handleSubscriptionDeleted(subscription) {
    const { id: subscriptionId, customer: customerId } = subscription;
    console.log('Subscription deleted:', { customerId, subscriptionId });
    // Handle new subscription deletion
}

async function handleSubscriptionCreated(subscription) {
    const { id: subscriptionId, customer: customerId, plan } = subscription;
    console.log('Subscription created:', { customerId, subscriptionId, planId: plan.id });
    // Handle new subscription creation
}

async function handleUpcomingInvoice(invoice) {
    const { customer: customerId, subscription: subscriptionId } = invoice;
    console.log('Upcoming invoice:', { customerId, subscriptionId, amount: invoice.amount_due });
    // Notify customer of upcoming charge
}

async function handleCustomerUpdated(customer) {
    console.log('Customer updated:', { customerId: customer.id });
    // Handle customer updates if necessary
}