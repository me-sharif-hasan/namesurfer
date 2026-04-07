// pages/api/v2/auth/login.js
// POST /api/v2/auth/login
// Body: { identifier, password }
// Handles login by either Email or Username.
// Exchanges credentials for a Firebase ID token using the Firebase REST API.

import { adminDb } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIP } from '../../../../lib/rate-limit';
import { logAPI, logInfo, logError } from '../../../../lib/logger';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  if (!checkRateLimit(`${clientIP}:v2:login`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  }

  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier (email or username) and password are required' });
    }

    let email = identifier.trim().toLowerCase();
    let username = null;

    // ── 1. Resolve Email from Username if needed ──────────────────────────────
    // If it doesn't look like an email, assume it's a username
    if (!email.includes('@')) {
      username = email;
      const userSnap = await adminDb.collection('users')
        .where('username', '==', username)
        .limit(1)
        .get();

      if (userSnap.empty) {
        logAPI(req.method, '/api/v2/auth/login', 401, Date.now() - startTime);
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const userData = userSnap.docs[0].data();
      email = userData.email;
    }

    // ── 2. Authenticate via Firebase REST API ─────────────────────────────────
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
    
    const response = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logAPI(req.method, '/api/v2/auth/login', 401, Date.now() - startTime);
      return res.status(401).json({ 
        error: data.error?.message === 'INVALID_PASSWORD' || data.error?.message === 'EMAIL_NOT_FOUND' 
          ? 'Invalid email/username or password' 
          : data.error?.message || 'Authentication failed'
      });
    }

    // ── 3. Fetch User Profile from Firestore ──────────────────────────────────
    const userDoc = await adminDb.collection('users').doc(data.localId).get();
    const profile = userDoc.exists ? userDoc.data() : { email: data.email };

    logInfo(`User logged in: ${profile.username || email} (${email})`);
    logAPI(req.method, '/api/v2/auth/login', 200, Date.now() - startTime);

    return res.status(200).json({
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      localId: data.localId,
      profile: {
        uid: data.localId,
        username: profile.username || null,
        name: profile.name || data.displayName || null,
        email: data.email,
        emailVerified: profile.emailVerified || false,
        onboardingStatus: profile.onboardingStatus || 'pending'
      }
    });

  } catch (error) {
    logError('v2 login error', error);
    logAPI(req.method, '/api/v2/auth/login', 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}
