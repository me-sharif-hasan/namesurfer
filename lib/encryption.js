// lib/encryption.js
// AES-256-GCM symmetric encryption / decryption for sensitive Firestore fields.
//
// Required env variable:
//   SSH_ENCRYPTION_KEY — 64-character hex string (32 raw bytes)
//   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Encrypted format (base64-url-safe joined by ':'):
//   <iv_base64>:<authTag_base64>:<ciphertext_base64>

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hexKey = process.env.SSH_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'SSH_ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // 16 bytes

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * @param {string} encryptedStr  "<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 * @returns {string} plaintext
 */
export function decrypt(encryptedStr) {
  const key = getKey();
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
