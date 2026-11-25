const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Stripe = require('stripe');

if (getApps().length === 0) {
  initializeApp();
}

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const appUrl = 'https://www.kooleriq.com';
const allowedOrigins = [
  'https://www.kooleriq.com',
  'https://kooleriq.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getStripe() {
  return new Stripe(stripeSecretKey.value());
}

function getSubscriptionQuantity(planTier, doorQuota, storeCount) {
  return planTier === 'pro' ? doorQuota * storeCount : storeCount;
}

function getUnitPrice(planTier, billingCycle) {
  const prices = {
    pro: { monthly: 49, annual: 39 },
    enterprise: { monthly: 119, annual: 95 },
  };
  return prices[planTier][billingCycle];
}

async function getAuthenticatedUser(req) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    throw Object.assign(new Error('Authentication required.'), { status: 401 });
  }
  return getAuth().verifyIdToken(authorization.slice('Bearer '.length));
}

exports.createCheckoutSession = onRequest(
  { cors: allowedOrigins, secrets: [stripeSecretKey] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    try {
      const user = await getAuthenticatedUser(req);
      const { planTier, billingCycle, doorQuota, storeCount } = req.body || {};
      if (!['pro', 'enterprise'].includes(planTier) || !['monthly', 'annual'].includes(billingCycle)) {
        return res.status(400).json({ error: 'A paid plan and billing cycle are required.' });
      }

      const parsedDoors = Number(doorQuota);
      const parsedStores = Number(storeCount);
      if (
        !Number.isInteger(parsedDoors) ||
        parsedDoors < 1 ||
        parsedDoors > 25 ||
        !Number.isInteger(parsedStores) ||
        parsedStores < 1 ||
        parsedStores > 100
      ) {
        return res.status(400).json({ error: 'Door or store count is outside the allowed range.' });
      }

      const monthlyUnitPrice = getUnitPrice(planTier, billingCycle);
      const interval = billingCycle === 'annual' ? 'year' : 'month';
      const unitAmount =
        interval === 'year' ? monthlyUnitPrice * 12 * 100 : monthlyUnitPrice * 100;
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        ...(user.email ? { customer_email: user.email } : {}),
        billing_address_collection: 'required',
        automatic_tax: { enabled: true },
        line_items: [
          {
            quantity: getSubscriptionQuantity(planTier, parsedDoors, parsedStores),
            price_data: {
              currency: 'usd',
              unit_amount: unitAmount,
              recurring: { interval },
              product_data: {
                name: `KoolerIQ ${planTier === 'pro' ? 'Pro Operator' : 'Enterprise Fleet'}`,
              },
            },
          },
        ],
        success_url: `${appUrl}/?stripe_success=1`,
        cancel_url: `${appUrl}/?stripe_canceled=1`,
        metadata: {
          firebaseUid: user.uid,
          planTier,
          billingCycle,
          doorQuota: String(parsedDoors),
          storeCount: String(parsedStores),
        },
        subscription_data: {
          metadata: {
            firebaseUid: user.uid,
            planTier,
            billingCycle,
            doorQuota: String(parsedDoors),
            storeCount: String(parsedStores),
          },
        },
      });

      if (!session.url) {
        throw new Error('Stripe did not return a Checkout URL.');
      }
      return res.json({ url: session.url });
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: error.message });
      }
      console.error('Stripe Checkout creation failed:', error);
      return res.status(502).json({ error: 'Unable to start Stripe Checkout.' });
    }
  }
);

exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method not allowed.');
    }

    let event;
    try {
      event = getStripe().webhooks.constructEvent(
        req.rawBody,
        req.get('stripe-signature'),
        stripeWebhookSecret.value()
      );
    } catch (error) {
      console.error('Stripe webhook signature verification failed:', error.message);
      return res.status(400).send('Invalid Stripe webhook signature.');
    }

    const firestore = getFirestore();
    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata || {};
        if (
          session.mode === 'subscription' &&
          metadata.firebaseUid &&
          ['pro', 'enterprise'].includes(metadata.planTier) &&
          ['monthly', 'annual'].includes(metadata.billingCycle) &&
          ['paid', 'no_payment_required'].includes(session.payment_status)
        ) {
          await firestore.doc(`users/${metadata.firebaseUid}`).set(
            {
              planTier: metadata.planTier,
              billingCycle: metadata.billingCycle,
              doorQuota: Number(metadata.doorQuota),
              storeCount: Number(metadata.storeCount),
              googlePlayLinked: false,
              subscriptionStatus: 'active',
              stripeCustomerId:
                typeof session.customer === 'string' ? session.customer : null,
              stripeSubscriptionId:
                typeof session.subscription === 'string' ? session.subscription : null,
              updatedAt: new Date(),
            },
            { merge: true }
          );
        }
      }

      if (
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const subscription = event.data.object;
        const uid = subscription.metadata && subscription.metadata.firebaseUid;
        if (uid) {
          await firestore.doc(`users/${uid}`).set(
            {
              subscriptionStatus:
                event.type === 'customer.subscription.deleted'
                  ? 'canceled'
                  : subscription.status,
              updatedAt: new Date(),
            },
            { merge: true }
          );
        }
      }

      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const subscriptionRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;
        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          const uid = subscription.metadata && subscription.metadata.firebaseUid;
          if (uid) {
            await firestore.doc(`users/${uid}`).set(
              {
                subscriptionStatus: event.type === 'invoice.paid' ? 'active' : 'past_due',
                updatedAt: new Date(),
              },
              { merge: true }
            );
          }
        }
      }
    } catch (error) {
      console.error('Stripe webhook processing failed:', error);
      return res.status(500).send('Stripe event processing failed.');
    }

    return res.json({ received: true });
  }
);
