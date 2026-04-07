// pages/api/v2/auth/google.js
// POST /api/v2/auth/google
// Body: { idToken, username?, name? }
// Mobile-friendly: accepts a Firebase ID token obtained from the native Google Sign-In SDK.
// - Existing users: returns their profile (login flow).
// - New users: requires `username`; creates a profile (Google accounts are pre-verified).

import { adminDb, adminAuth } from '../../../../lib/firebase-admin';
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
  if (!checkRateLimit(`${clientIP}:v2:google`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait.' });
  }

  try {
    const { idToken, username, name } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Verify ID token via Firebase Admin
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (_) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { uid, email } = decoded;

    // ── Existing user → login ─────────────────────────────────────────────────
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const d = userDoc.data();
      logInfo(`Google login: ${d.username} (${email})`);
      logAPI(req.method, '/api/v2/auth/google', 200, Date.now() - startTime);
      return res.status(200).json({
        uid,
        username: d.username,
        name: d.name,
        email,
        emailVerified: true,
        onboardingStatus: d.onboardingStatus,
        isNew: false,
      });
    }

    // ── New user → needs username ──────────────────────────────────────────────
    if (!username) {
      return res.status(400).json({
        error: 'Username is required for first-time Google sign-up',
        requiresUsername: true,
      });
    }

    const u = username.trim().toLowerCase();
    const n = (name || decoded.name || email.split('@')[0]).trim();

    if (!USERNAME_REGEX.test(u)) {
      return res.status(400).json({
        error: 'Username must be 3–20 characters: lowercase letters, numbers, or underscores',
      });
    }
    if (RESERVED_USERNAMES.has(u)) {
      return res.status(400).json({ error: 'This username is reserved' });
    }

    // Username uniqueness
    const usernameSnap = await adminDb.collection('users')
      .where('username', '==', u).limit(1).get();
    if (!usernameSnap.empty) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    // Create profile (Google accounts are email-verified by definition)
    await adminDb.collection('users').doc(uid).set({
      uid,
      username: u,
      name: n,
      email,
      emailVerified: true,
      onboardingStatus: 'pending',
      linuxUser: `inthespace_${u}`,
      createdAt: new Date(),
      provider: 'google',
    });

    logInfo(`New Google user: ${u} (${email})`);
    logAPI(req.method, '/api/v2/auth/google', 201, Date.now() - startTime);

    return res.status(201).json({
      uid,
      username: u,
      name: n,
      email,
      emailVerified: true,
      onboardingStatus: 'pending',
      isNew: true,
    });

  } catch (error) {
    logError('v2 google auth error', error);
    logAPI(req.method, '/api/v2/auth/google', 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
}
