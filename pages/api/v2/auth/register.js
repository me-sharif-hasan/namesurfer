// pages/api/v2/auth/register.js
// POST /api/v2/auth/register
// Body: { username, name, email, password }
// Creates a new user and sends a 6-digit OTP for email verification.
// If the email already exists but is unverified, resends the OTP instead.

import { adminDb, adminAuth } from '../../../../lib/firebase-admin';
import { sendOTP } from '../../../../lib/email-otp';
import { checkRateLimit, getClientIP } from '../../../../lib/rate-limit';
import { logAPI, logInfo, logError } from '../../../../lib/logger';

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'www', 'mail', 'ftp', 'api', 'ns1', 'ns2',
  'support', 'info', 'help', 'test', 'demo', 'inthespace', 'staff', 'abuse',
]);

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  if (!checkRateLimit(`${clientIP}:v2:register`, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many registration attempts. Try again in 15 minutes.' });
  }

  try {
    const { username, name, email, password } = req.body || {};

    // ── Required fields ──────────────────────────────────────────────────────
    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: 'username, name, email, and password are all required' });
    }

    // ── Validate username ─────────────────────────────────────────────────────
    const u = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(u)) {
      return res.status(400).json({
        error: 'Username must be 3–20 characters and contain only lowercase letters, numbers, or underscores',
      });
    }
    if (RESERVED_USERNAMES.has(u)) {
      return res.status(400).json({ error: 'This username is reserved' });
    }

    // ── Validate name ─────────────────────────────────────────────────────────
    const n = name.trim();
    if (n.length < 2 || n.length > 50) {
      return res.status(400).json({ error: 'Name must be 2–50 characters' });
    }

    // ── Validate email ────────────────────────────────────────────────────────
    const emailVal = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // ── Validate password ─────────────────────────────────────────────────────
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // ── Username uniqueness ───────────────────────────────────────────────────
    const usernameSnap = await adminDb.collection('users')
      .where('username', '==', u).limit(1).get();
    if (!usernameSnap.empty) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    // ── Check for existing Firebase Auth account ──────────────────────────────
    let existingUid = null;
    try {
      const existing = await adminAuth.getUserByEmail(emailVal);
      existingUid = existing.uid;
    } catch (_) { /* no existing account — good */ }

    if (existingUid) {
      const userDoc = await adminDb.collection('users').doc(existingUid).get();
      if (userDoc.exists && userDoc.data().emailVerified) {
        return res.status(409).json({ error: 'This email is already registered. Please sign in.' });
      }
      // Unverified — resend OTP
      const storedName = userDoc.exists ? userDoc.data().name : n;
      await sendOTP(existingUid, emailVal, storedName);
      logInfo(`OTP resent (unverified existing account): ${emailVal}`);
      logAPI(req.method, '/api/v2/auth/register', 200, Date.now() - startTime);
      return res.status(200).json({
        uid: existingUid,
        message: 'A verification code has been resent to your email.',
        resent: true,
      });
    }

    // ── Create Firebase Auth user ─────────────────────────────────────────────
    const userRecord = await adminAuth.createUser({
      email: emailVal,
      password,
      displayName: n,
      emailVerified: false,
    });

    // ── Create Firestore user profile ─────────────────────────────────────────
    await adminDb.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      username: u,
      name: n,
      email: emailVal,
      emailVerified: false,
      onboardingStatus: 'pending',
      linuxUser: `inthespace_${u}`,
      createdAt: new Date(),
      provider: 'password',
    });

    // ── Send OTP ──────────────────────────────────────────────────────────────
    await sendOTP(userRecord.uid, emailVal, n);

    logInfo(`New user registered: ${u} (${emailVal})`);
    logAPI(req.method, '/api/v2/auth/register', 201, Date.now() - startTime);

    return res.status(201).json({
      uid: userRecord.uid,
      message: 'Account created! Check your email for a 6-digit verification code.',
    });

  } catch (error) {
    logError('v2 register error', error);
    logAPI(req.method, '/api/v2/auth/register', 500, Date.now() - startTime);

    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'This email is already registered.' });
    }
    if (error.code === 'auth/weak-password') {
      return res.status(400).json({ error: 'Password is too weak. Use at least 8 characters.' });
    }
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}
