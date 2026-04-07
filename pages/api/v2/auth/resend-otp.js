// pages/api/v2/auth/resend-otp.js
// POST /api/v2/auth/resend-otp
// Body: { email }
// Resends the OTP verification code to an unverified account.
// Rate-limited to 3 requests per 15 minutes per IP.

import { adminDb, adminAuth } from '../../../../lib/firebase-admin';
import { sendOTP } from '../../../../lib/email-otp';
import { checkRateLimit, getClientIP } from '../../../../lib/rate-limit';
import { logAPI, logInfo, logError } from '../../../../lib/logger';

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  if (!checkRateLimit(`${clientIP}:v2:resend-otp`, 3, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many resend requests. Please wait 15 minutes.' });
  }

  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const emailVal = email.trim().toLowerCase();

    // Lookup user in Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(emailVal);
    } catch (_) {
      // Don't reveal whether email exists — generic message
      return res.status(200).json({
        message: 'If an unverified account exists for this email, a code has been sent.',
      });
    }

    const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
    if (!userDoc.exists) {
      return res.status(200).json({
        message: 'If an unverified account exists for this email, a code has been sent.',
      });
    }

    const userData = userDoc.data();
    if (userData.emailVerified) {
      return res.status(400).json({ error: 'This email is already verified. Please sign in.' });
    }

    await sendOTP(userRecord.uid, emailVal, userData.name);

    logInfo(`OTP resent to: ${emailVal}`);
    logAPI(req.method, '/api/v2/auth/resend-otp', 200, Date.now() - startTime);

    return res.status(200).json({
      message: 'Verification code sent. Please check your email.',
    });

  } catch (error) {
    logError('v2 resend-otp error', error);
    logAPI(req.method, '/api/v2/auth/resend-otp', 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Failed to resend code. Please try again.' });
  }
}
