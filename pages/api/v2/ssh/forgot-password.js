// pages/api/v2/ssh/forgot-password.js
// POST /api/v2/ssh/forgot-password
// Sends a 6-digit OTP to the user's email to confirm an SSH password reset.

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { adminDb } from '../../../../lib/firebase-admin';
import { verifyAuthToken } from '../../../../lib/auth-middleware';
import { logInfo, logError } from '../../../../lib/logger';

const OTP_EXPIRY_MINUTES = 15;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

// In-memory rate limit (keyed by uid)
const rateLimitMap = new Map();

function checkRateLimit(uid) {
  const now = Date.now();
  const entry = rateLimitMap.get(uid) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 0;
    entry.windowStart = now;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count += 1;
  rateLimitMap.set(uid, entry);
  return true;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await verifyAuthToken(req);
    const uid = user.uid;

    if (!checkRateLimit(uid)) {
      return res.status(429).json({
        error: `Too many requests. Maximum ${RATE_LIMIT_MAX} per hour.`,
      });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = userDoc.data();
    if (profile.onboardingStatus !== 'completed') {
      return res.status(403).json({ error: 'Account provisioning not yet complete' });
    }

    const email = profile.email;
    const username = profile.username;
    if (!email || !username) {
      return res.status(400).json({ error: 'User profile is missing email or username' });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await adminDb.collection('ssh_password_resets').doc(uid).set({
      otp,
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
    });

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"InTheSpace Hosting" <noreply@inthespace.online>',
      to: email,
      subject: `${otp} — InTheSpace SSH password reset code`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#1a1a2e;margin-top:0">SSH Password Reset</h2>
          <p>Hi <b>${username}</b>,</p>
          <p>Use this code to reset your SSH password for <code>inthespace_${username}</code>:</p>
          <div style="font-size:40px;font-weight:bold;letter-spacing:12px;text-align:center;
                      padding:24px;background:#fff;border:2px solid #e0e0e0;border-radius:8px;
                      color:#1a1a2e;margin:24px 0;">
            ${otp}
          </div>
          <p style="color:#666;font-size:14px;">This code expires in <b>${OTP_EXPIRY_MINUTES} minutes</b>.</p>
          <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    logInfo(`SSH password reset OTP sent to ${email} for user ${username}`);
    return res.status(200).json({ message: 'Reset code sent to your email.' });

  } catch (error) {
    logError('ssh/forgot-password error', error);
    if (error.message.startsWith('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to send reset code' });
  }
}
