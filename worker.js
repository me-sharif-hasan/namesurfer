#!/usr/bin/env node
// worker.js - Privileged onboarding worker process
// Run with pm2 (as root or with sudoers): pm2 start worker.js --name onboarding-worker
//
// Responsibilities:
//   1. Listen to Firebase RTDB `onboarding_jobs/` for queued jobs
//   2. Run up to MAX_CONCURRENT jobs at once (default: 3)
//   3. Execute provision.sh for each system-level step
//   4. Update RTDB job state in real-time (streamed to SSE clients)
//   5. Update Firestore user profile on completion

'use strict';

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');

// ── Load env vars (.env) ──────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}

// ── Firebase Admin init (CommonJS) ────────────────────────────────────────────
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, 'firebase-admin-key.json');
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  let credential;
  if (fs.existsSync(serviceAccountPath)) {
    credential = admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')));
  } else if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    credential = admin.credential.applicationDefault();
  }
  if (!databaseURL) {
    console.error('[FATAL] FIREBASE_DATABASE_URL is not set. Add it to your .env file.');
    process.exit(1);
  }
  admin.initializeApp({ credential, databaseURL });
}

const rtdb = admin.database();
const firestore = admin.firestore();

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_ONBOARDING || '3', 10);
const PROVISION_SCRIPT = path.join(__dirname, 'scripts', 'provision.sh');
const SERVER_IP = process.env.DEFAULT_DNS_TARGET_IP || '104.0.1.112';
const PARENT_DOMAIN = (process.env.POWERDNS_ZONE || 'inthespace.online.').replace(/\.$/, '');
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_ROOT_USER = process.env.MYSQL_ROOT_USER || 'root';
const MYSQL_ROOT_PASSWORD = process.env.MYSQL_ROOT_PASSWORD || '';
const STORAGE_QUOTA_MB = parseInt(process.env.USER_STORAGE_QUOTA_MB || '500', 10);
const RAM_QUOTA_MB = parseInt(process.env.USER_RAM_QUOTA_MB || '200', 10);

const DB_PREFIX = 'inthespace_';

// ── State ─────────────────────────────────────────────────────────────────────
const processingJobs = new Set();

log('INFO', `Worker started | max_concurrent=${MAX_CONCURRENT}`);

// ── Logger ────────────────────────────────────────────────────────────────────
function log(level, msg) {
  console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
}

// ── Run provision.sh ──────────────────────────────────────────────────────────
function runProvision(args) {
  return new Promise((resolve, reject) => {
    execFile('sudo', [PROVISION_SCRIPT, ...args], { timeout: 60000 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim();
      if (err) {
        log('ERROR', `provision.sh ${args[0]} failed: ${output}`);
        reject(new Error(output || err.message));
      } else {
        log('INFO', `provision.sh ${args[0]}: ${output}`);
        resolve(output);
      }
    });
  });
}

// ── PowerDNS: create A record ─────────────────────────────────────────────────
async function createDNSRecord(username) {
  const zone = (process.env.POWERDNS_ZONE || 'inthespace.online.');
  const fqdn = `${username}.${zone}`;
  const url = `${process.env.POWERDNS_API_URL}/api/v1/servers/localhost/zones/${zone}`;

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'X-API-Key': process.env.POWERDNS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rrsets: [{ name: fqdn, type: 'A', ttl: 3600, changetype: 'REPLACE',
        records: [{ content: SERVER_IP, disabled: false }] }],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`PowerDNS error (${resp.status}): ${txt}`);
  }
  return true;
}

// ── Update job step in RTDB ───────────────────────────────────────────────────
async function updateStep(jobId, stepId, status, message = '') {
  await rtdb.ref(`onboarding_jobs/${jobId}/steps/${stepId}`).update({
    status,
    message,
    timestamp: Date.now(),
  });
}

// ── Process a single job ──────────────────────────────────────────────────────
async function processJob(jobId, jobData) {
  const { username, userId } = jobData;
  log('INFO', `Processing job ${jobId} for user ${username}`);

  // Mark running
  await rtdb.ref(`onboarding_jobs/${jobId}`).update({ status: 'running', startedAt: Date.now() });

  const steps = [
    // ── Step 1: Create Linux user ──────────────────────────────────────────────
    {
      id: 'create_linux_user',
      run: () => runProvision(['create-user', username]),
    },
    // ── Step 1b: Set SSH password ───────────────────────────────────────────────
    {
      id: 'set_ssh_password',
      run: async () => {
        const sshPassword = crypto.randomBytes(16).toString('base64').slice(0, 20);
        await runProvision(['set-ssh-password', username, sshPassword]);
        await firestore.collection('users').doc(userId).update({
          sshPassword,
        });
      },
    },
    // ── Step 2: Create public_html ─────────────────────────────────────────────
    {
      id: 'create_public_html',
      run: () => runProvision(['create-public-html', username]),
    },
    // ── Step 3: Deny sudo ──────────────────────────────────────────────────────
    {
      id: 'deny_sudo',
      run: () => runProvision(['deny-sudo', username]),
    },
    // ── Step 4: Set disk quota ─────────────────────────────────────────────────
    {
      id: 'set_disk_quota',
      run: () => runProvision(['set-disk-quota', username, String(STORAGE_QUOTA_MB)]),
    },
    // ── Step 5: Register DNS ───────────────────────────────────────────────────
    {
      id: 'register_dns',
      run: () => createDNSRecord(username),
    },
    // ── Step 6: Create Apache vhost ────────────────────────────────────────────
    {
      id: 'create_vhost',
      run: async () => {
        const domain = `${username}.${PARENT_DOMAIN}`;
        await runProvision(['create-vhost', username, domain]);
        await runProvision(['reload-apache', username]);
      },
    },
    // ── Step 7: Create MySQL user ──────────────────────────────────────────────
    {
      id: 'create_mysql_user',
      run: async () => {
        const dbName = `${DB_PREFIX}${username}`;
        const dbPassword = crypto.randomBytes(16).toString('hex');
        await runProvision(['create-mysql-user', username, dbName, dbPassword]);

        // Store credentials in Firestore
        await firestore.collection('users').doc(userId).update({
          dbUser: `inthespace_db_user_${username}`,
          dbName,
          dbPassword, // store securely; consider encrypting in production
          dbHost: MYSQL_HOST,
        });
      },
    },
    // ── Step 8: Finalize ───────────────────────────────────────────────────────
    {
      id: 'finalize',
      run: async () => {
        await firestore.collection('users').doc(userId).update({
          onboardingStatus: 'completed',
          onboardingCompletedAt: new Date(),
          activeJobId: null,
          subdomain: `${username}.${PARENT_DOMAIN}`,
          publicHtmlPath: `/home/inthespace_${username}/public_html`,
        });
      },
    },
  ];

  // Run all steps sequentially
  for (const step of steps) {
    try {
      await updateStep(jobId, step.id, 'running', 'In progress…');
      await step.run();
      await updateStep(jobId, step.id, 'done', 'Done');
    } catch (err) {
      await updateStep(jobId, step.id, 'error', err.message);
      // Mark job failed in RTDB + Firestore
      await rtdb.ref(`onboarding_jobs/${jobId}`).update({
        status: 'failed',
        completedAt: Date.now(),
        error: `Step '${step.id}' failed: ${err.message}`,
      });
      await firestore.collection('users').doc(userId).update({
        onboardingStatus: 'failed',
        activeJobId: null,
      });
      log('ERROR', `Job ${jobId} failed at step ${step.id}: ${err.message}`);
      return;
    }
  }

  // All steps done
  await rtdb.ref(`onboarding_jobs/${jobId}`).update({
    status: 'completed',
    completedAt: Date.now(),
  });
  log('INFO', `Job ${jobId} completed for user ${username}`);
}

// ── Queue manager ─────────────────────────────────────────────────────────────
async function checkQueue() {
  if (processingJobs.size >= MAX_CONCURRENT) return;

  const slots = MAX_CONCURRENT - processingJobs.size;
  const snap = await rtdb.ref('onboarding_jobs')
    .orderByChild('status').equalTo('queued')
    .limitToFirst(slots)
    .once('value');

  if (!snap.exists()) return;

  snap.forEach(child => {
    const jobId = child.key;
    if (processingJobs.has(jobId)) return;

    processingJobs.add(jobId);
    processJob(jobId, child.val())
      .finally(() => {
        processingJobs.delete(jobId);
        checkQueue(); // pick up next waiting job
      });
  });
}

// ── Startup: reset any jobs stuck in 'running' from a previous crash ──────────
async function resetStuckJobs() {
  const snap = await rtdb.ref('onboarding_jobs')
    .orderByChild('status').equalTo('running').once('value');
  if (!snap.exists()) return;

  const updates = {};
  snap.forEach(child => {
    updates[`${child.key}/status`] = 'queued';
    updates[`${child.key}/startedAt`] = null;
  });
  await rtdb.ref('onboarding_jobs').update(updates);
  log('INFO', `Reset ${Object.keys(updates).length / 2} stuck job(s) to queued`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  await resetStuckJobs();

  // Listen for new queued jobs
  rtdb.ref('onboarding_jobs').orderByChild('status').equalTo('queued')
    .on('child_added', () => checkQueue());

  // Initial queue check on startup
  await checkQueue();

  log('INFO', 'Worker ready and listening for jobs…');
})().catch(err => {
  log('ERROR', `Worker init failed: ${err.message}`);
  process.exit(1);
});
