// pages/api/v2/ssh/generate-key.js
// POST /api/v2/ssh/generate-key
// Generates an RSA key pair, installs public key on server, stores private key in Firestore.

import crypto from 'crypto';
import { execFile } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { adminDb } from '../../../../lib/firebase-admin';
import { verifyAuthToken } from '../../../../lib/auth-middleware';
import { runProvision } from '../../../../lib/provision-runner';
import { encrypt } from '../../../../lib/encryption';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { logInfo, logError } from '../../../../lib/logger';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await verifyAuthToken(req);

    const uid = user.uid;
    if (!checkRateLimit(`ssh:generate-key:${uid}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)) {
      logInfo(`Rate limit hit: ssh/generate-key for ${user.email}`);
      return res.status(429).json({
        error: `Too many key generations. Maximum ${RATE_LIMIT_MAX} per day.`
      });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = userDoc.data();
    if (profile.onboardingStatus !== 'completed') {
      return res.status(403).json({
        error: 'Onboarding must be completed before generating SSH keys'
      });
    }

    const username = profile.username;
    if (!username) {
      return res.status(400).json({ error: 'Username not found in profile' });
    }

    const { publicKey, privateKey } = await generateKeyPair();
    const keyId = crypto.randomUUID();

    const encryptedPrivateKey = encrypt(privateKey);
    const downloadUrl = `/api/v2/ssh/download-key?keyId=${keyId}`;

    await adminDb.collection('users').doc(uid).update({
      sshKeyId: keyId,
      sshPublicKey: publicKey,
      sshPrivateKey: encryptedPrivateKey,
      sshKeyGeneratedAt: new Date(),
    });

    await runProvision(['add-ssh-pubkey', username, publicKey]);

    logInfo(`SSH key generated for user ${username} (${user.email})`);

    return res.status(200).json({
      keyId,
      message: 'SSH key generated successfully. Download the private key now — it will not be shown again.',
      downloadUrl,
    });

  } catch (error) {
    logError('ssh/generate-key error', error);
    return res.status(500).json({ error: 'Failed to generate SSH key' });
  }
}

function generateKeyPair() {
  return new Promise((resolve, reject) => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'sshkey-'));
    const keyPath = path.join(tmpDir, 'id_ed25519');

    execFile(
      'ssh-keygen',
      ['-t', 'ed25519', '-f', keyPath, '-N', '', '-C', ''],
      (err) => {
        if (err) {
          rmSync(tmpDir, { recursive: true, force: true });
          return reject(err);
        }
        try {
          const privateKey = readFileSync(keyPath, 'utf8');
          // Public key line is "ssh-ed25519 AAAA... " — strip trailing newline/comment
          const publicKey = readFileSync(`${keyPath}.pub`, 'utf8').trim();
          resolve({ publicKey, privateKey });
        } catch (readErr) {
          reject(readErr);
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    );
  });
}
