// pages/api/v2/ssh/download-key.js
// GET /api/v2/ssh/download-key?keyId=<keyId>
// Downloads the private SSH key (one-time delivery, clears after download).

import { adminDb } from '../../../../lib/firebase-admin';
import { verifyAuthToken } from '../../../../lib/auth-middleware';
import { decrypt } from '../../../../lib/encryption';
import { logInfo, logError } from '../../../../lib/logger';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await verifyAuthToken(req);
    const uid = user.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = userDoc.data();
    const { sshPrivateKey, sshKeyId } = profile;

    if (!sshPrivateKey) {
      return res.status(404).json({
        error: 'No SSH private key found. Generate a key first.'
      });
    }

    const keyId = req.query.keyId;
    if (keyId && keyId !== sshKeyId) {
      return res.status(400).json({
        error: 'Invalid keyId. The key may have been regenerated.'
      });
    }

    let privateKey;
    try {
      privateKey = decrypt(sshPrivateKey);
    } catch (e) {
      logError('Failed to decrypt SSH private key', e);
      return res.status(500).json({ error: 'Failed to decrypt private key' });
    }

    await adminDb.collection('users').doc(uid).update({
      sshPrivateKey: null,
    });

    logInfo(`SSH private key downloaded by ${user.email}`);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="id_rsa"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(privateKey);

  } catch (error) {
    logError('ssh/download-key error', error);
    return res.status(500).json({ error: 'Failed to download SSH key' });
  }
}
