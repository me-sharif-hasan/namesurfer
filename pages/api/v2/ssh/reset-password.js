// pages/api/v2/ssh/reset-password.js
// POST /api/v2/ssh/reset-password
// Body: { otp: string, newPassword: string }
// Verifies the OTP from forgot-password and sets the new SSH password.

import { adminDb } from '../../../../lib/firebase-admin';
import { verifyAuthToken } from '../../../../lib/auth-middleware';
import { runProvision } from '../../../../lib/provision-runner';
import { logInfo, logError } from '../../../../lib/logger';

const MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await verifyAuthToken(req);
    const uid = user.uid;

    const { otp, newPassword } = req.body || {};

    if (!otp || !newPassword) {
      return res.status(400).json({ error: 'otp and newPassword are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'Password must be at most 128 characters' });
    }

    // Load and validate OTP
    const resetRef = adminDb.collection('ssh_password_resets').doc(uid);
    const resetDoc = await resetRef.get();

    if (!resetDoc.exists) {
      return res.status(400).json({ error: 'No reset code found. Request a new one.' });
    }

    const resetData = resetDoc.data();

    if (resetData.expiresAt.toMillis() < Date.now()) {
      await resetRef.delete();
      return res.status(400).json({ error: 'Reset code has expired. Request a new one.' });
    }

    if (resetData.attempts >= MAX_ATTEMPTS) {
      await resetRef.delete();
      return res.status(400).json({ error: 'Too many failed attempts. Request a new code.' });
    }

    if (resetData.otp !== String(otp).trim()) {
      await resetRef.update({ attempts: resetData.attempts + 1 });
      const remaining = MAX_ATTEMPTS - resetData.attempts - 1;
      return res.status(400).json({
        error: `Invalid code. ${remaining} attempt(s) remaining.`,
      });
    }

    // OTP valid — look up the user's username
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { username } = userDoc.data();
    if (!username) {
      return res.status(400).json({ error: 'Username not found in profile' });
    }

    // Set the new SSH password on the Linux account
    await runProvision(['set-ssh-password', username, newPassword]);

    // Persist new password and clean up the reset token
    await Promise.all([
      adminDb.collection('users').doc(uid).update({ sshPassword: newPassword }),
      resetRef.delete(),
    ]);

    logInfo(`SSH password reset completed for user ${username} (${user.email})`);
    return res.status(200).json({ message: 'SSH password updated successfully.' });

  } catch (error) {
    logError('ssh/reset-password error', error);
    if (error.message.startsWith('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to reset SSH password' });
  }
}
