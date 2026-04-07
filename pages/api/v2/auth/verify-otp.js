// pages/api/v2/auth/verify-otp.js
// POST /api/v2/auth/verify-otp
// Body: { uid, code }
// Verifies the 6-digit OTP and marks the user's email as verified.

import { adminDb, adminAuth } from '../../../../lib/firebase-admin';
import { verifyOTP } from '../../../../lib/email-otp';
import { checkRateLimit, getClientIP } from '../../../../lib/rate-limit';
import { logAPI, logInfo, logError } from '../../../../lib/logger';

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  if (!checkRateLimit(`${clientIP}:v2:verify-otp`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' });
  }

  try {
    const { uid, code } = req.body || {};

    if (!uid || !code) {
      return res.status(400).json({ error: 'uid and code are required' });
    }

    // Validate user exists in our system
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userDoc.data().emailVerified) {
      return res.status(400).json({ error: 'Email is already verified. Please sign in.' });
    }

    // Verify OTP
    const result = await verifyOTP(uid, code);
    if (!result.valid) {
      logAPI(req.method, '/api/v2/auth/verify-otp', 400, Date.now() - startTime);
      return res.status(400).json({ error: result.error });
    }

    // Mark verified in Firestore + Firebase Auth simultaneously
    await Promise.all([
      adminDb.collection('users').doc(uid).update({ emailVerified: true }),
      adminAuth.updateUser(uid, { emailVerified: true }),
    ]);

    logInfo(`Email verified: uid=${uid}`);
    logAPI(req.method, '/api/v2/auth/verify-otp', 200, Date.now() - startTime);

    return res.status(200).json({
      success: true,
      message: 'Email verified! You can now sign in and start onboarding.',
    });

  } catch (error) {
    logError('v2 verify-otp error', error);
    logAPI(req.method, '/api/v2/auth/verify-otp', 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}
