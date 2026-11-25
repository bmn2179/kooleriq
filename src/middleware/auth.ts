import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminFirestore } from '../lib/firebase-admin.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requirePaidSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }

  try {
    const snapshot = await adminFirestore.doc(`users/${req.user.uid}`).get();
    const subscription = snapshot.data();
    const hasPaidPlan =
      subscription?.planTier === 'pro' || subscription?.planTier === 'enterprise';
    const isActive =
      subscription?.subscriptionStatus === 'active' ||
      subscription?.subscriptionStatus === 'trialing';

    if (!snapshot.exists || !hasPaidPlan || !isActive) {
      return res.status(402).json({ error: 'An active Pro or Enterprise subscription is required.' });
    }

    return next();
  } catch (error) {
    console.error('Error verifying Firebase subscription:', error);
    return res.status(503).json({ error: 'Unable to verify subscription status.' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
    } catch {
      // Proceed unauthenticated when optional token is invalid/expired
    }
  }
  next();
};
