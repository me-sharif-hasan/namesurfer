// pages/api/v2/onboarding/status/[jobId].js
// GET /api/v2/onboarding/status/:jobId
// Requires: Authorization: Bearer <firebase-id-token>
// Server-Sent Events (SSE) stream — pushes real-time step progress from Firebase RTDB.
//
// Event types sent to client:
//   data: { type: 'update', job: {...} }     — job state changed
//   data: { type: 'complete', job: {...} }   — job finished successfully
//   data: { type: 'error', job: {...} }      — job failed
//   data: { type: 'keepalive' }              — heartbeat every 15s

import { adminDb } from '../../../../../lib/firebase-admin';
import { rtdb } from '../../../../../lib/firebase-rtdb';
import { verifyAuthToken } from '../../../../../lib/auth-middleware';
import { logAPI, logInfo, logError } from '../../../../../lib/logger';

// Disable Next.js response buffering for SSE
export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Authenticate ────────────────────────────────────────────────────────────
  let user;
  try {
    user = await verifyAuthToken(req);
  } catch (_) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { jobId } = req.query;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    // ── Verify job ownership ──────────────────────────────────────────────────
    const jobSnap = await rtdb.ref(`onboarding_jobs/${jobId}`).once('value');
    if (!jobSnap.exists()) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobData = jobSnap.val();
    if (jobData.userId !== user.uid && !user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    logInfo(`SSE stream opened: jobId=${jobId} user=${user.email}`);

    // ── Set SSE headers ───────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Helper to write an SSE event
    const send = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        // Flush if supported (needed in some Node.js setups)
        if (res.flush) res.flush();
      } catch (_) { /* client disconnected */ }
    };

    // Send initial snapshot immediately
    send({ type: 'update', job: jobData });

    // If already terminal when stream opens, close immediately
    if (jobData.status === 'completed' || jobData.status === 'failed') {
      const type = jobData.status === 'completed' ? 'complete' : 'error';
      send({ type, job: jobData });
      res.end();
      logAPI(req.method, `/api/v2/onboarding/status/${jobId}`, 200, Date.now() - startTime);
      return;
    }

    // ── RTDB real-time listener ───────────────────────────────────────────────
    const jobRef = rtdb.ref(`onboarding_jobs/${jobId}`);
    let closed = false;

    const onValue = (snapshot) => {
      if (closed) return;
      const data = snapshot.val();
      if (!data) return;

      if (data.status === 'completed') {
        send({ type: 'complete', job: data });
        cleanup();
      } else if (data.status === 'failed') {
        send({ type: 'error', job: data });
        cleanup();
      } else {
        send({ type: 'update', job: data });
      }
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      jobRef.off('value', onValue);
      clearInterval(heartbeat);
      try { res.end(); } catch (_) {}
      logAPI(req.method, `/api/v2/onboarding/status/${jobId}`, 200, Date.now() - startTime, user.email);
    };

    // Keepalive heartbeat every 15s to prevent proxy timeouts
    const heartbeat = setInterval(() => {
      if (closed) return;
      send({ type: 'keepalive' });
    }, 15000);

    // Start listening
    jobRef.on('value', onValue);

    // Clean up when client disconnects
    req.on('close', cleanup);
    req.on('aborted', cleanup);

    // Auto-close stream after 10 minutes max
    setTimeout(cleanup, 10 * 60 * 1000);

  } catch (error) {
    logError(`v2 onboarding/status error jobId=${jobId}`, error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Stream failed' });
    }
    try { res.end(); } catch (_) {}
  }
}
