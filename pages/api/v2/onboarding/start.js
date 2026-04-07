// pages/api/v2/onboarding/start.js
// POST /api/v2/onboarding/start
// Requires: Authorization: Bearer <firebase-id-token>
// Starts (or re-queues) the hosting provisioning workflow for the authenticated user.
// - Email must be verified before onboarding can begin.
// - Idempotent: returns existing jobId if already queued/running/completed.
// - Writes job to Firebase RTDB; the worker.js process picks it up.

import { adminDb } from '../../../../lib/firebase-admin';
import { rtdb } from '../../../../lib/firebase-rtdb';
import { withAuth } from '../../../../lib/auth-middleware';
import { checkRateLimit, getClientIP } from '../../../../lib/rate-limit';
import { logAPI, logInfo, logError } from '../../../../lib/logger';
import crypto from 'crypto';

// Ordered provisioning steps shown to the client
const STEPS = [
  { id: 'create_linux_user',  label: 'Creating Linux user account' },
  { id: 'create_public_html', label: 'Setting up public_html directory' },
  { id: 'deny_sudo',          label: 'Configuring security restrictions' },
  { id: 'set_disk_quota',     label: 'Applying 500 MB storage quota' },
  { id: 'register_dns',       label: 'Registering subdomain' },
  { id: 'create_vhost',       label: 'Configuring Apache virtual host' },
  { id: 'create_mysql_user',  label: 'Setting up MySQL database user' },
  { id: 'finalize',           label: 'Finalising account' },
];

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return withAuth(async (req, res) => {
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`${clientIP}:v2:onboarding-start`, 5, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many onboarding requests. Try again later.' });
    }

    try {
      const { uid } = req.user;

      // ── Load user profile ───────────────────────────────────────────────────
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User profile not found. Please register first.' });
      }

      const userData = userDoc.data();

      // ── Email must be verified ──────────────────────────────────────────────
      if (!userData.emailVerified) {
        return res.status(403).json({
          error: 'Please verify your email address before starting hosting setup.',
          requiresVerification: true,
        });
      }

      // ── Already completed ───────────────────────────────────────────────────
      if (userData.onboardingStatus === 'completed') {
        return res.status(200).json({
          message: 'Hosting is already set up for your account.',
          onboardingStatus: 'completed',
          username: userData.username,
          subdomain: `${userData.username}.${process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'inthespace.online'}`,
        });
      }

      // ── Return existing active job ──────────────────────────────────────────
      if (userData.activeJobId && ['queued', 'running'].includes(userData.onboardingStatus)) {
        logInfo(`Returning existing job ${userData.activeJobId} for ${userData.username}`);
        logAPI(req.method, '/api/v2/onboarding/start', 200, Date.now() - startTime);
        return res.status(200).json({
          jobId: userData.activeJobId,
          status: userData.onboardingStatus,
          message: 'Onboarding is already in progress.',
        });
      }

      // ── Create a new job ────────────────────────────────────────────────────
      const jobId = crypto.randomUUID();
      const now = Date.now();

      const initialSteps = {};
      for (const step of STEPS) {
        initialSteps[step.id] = { label: step.label, status: 'pending', message: '', timestamp: null };
      }

      const job = {
        jobId,
        userId: uid,
        username: userData.username,
        status: 'queued',
        createdAt: now,
        startedAt: null,
        completedAt: null,
        error: null,
        steps: initialSteps,
      };

      // Write to RTDB (worker.js reads from here)
      await rtdb.ref(`onboarding_jobs/${jobId}`).set(job);

      // Update Firestore user profile
      await adminDb.collection('users').doc(uid).update({
        onboardingStatus: 'queued',
        activeJobId: jobId,
      });

      logInfo(`Onboarding job created: ${jobId} for user ${userData.username}`);
      logAPI(req.method, '/api/v2/onboarding/start', 202, Date.now() - startTime);

      return res.status(202).json({
        jobId,
        status: 'queued',
        message: 'Hosting setup queued. Connect to the status stream to watch progress.',
        statusUrl: `/api/v2/onboarding/status/${jobId}`,
      });

    } catch (error) {
      logError('v2 onboarding/start error', error);
      logAPI(req.method, '/api/v2/onboarding/start', 500, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to start onboarding. Please try again.' });
    }
  })(req, res);
}
