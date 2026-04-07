// lib/email-otp.js - 6-digit OTP generation, storage, and email delivery
import nodemailer from 'nodemailer';
import { adminDb } from './firebase-admin';
import crypto from 'crypto';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '15', 10);
const MAX_ATTEMPTS = 5;

/** Generate a 6-digit numeric OTP */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/** Create nodemailer transporter from env vars */
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

/**
 * Generate and send an OTP to the given email.
 * Stores OTP in Firestore `otp_verifications/{uid}`.
 * @param {string} uid - Firebase UID
 * @param {string} email - recipient email
 * @param {string} name  - recipient name (for greeting)
 */
export async function sendOTP(uid, email, name) {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Persist OTP securely (overwrite any previous one)
  await adminDb.collection('otp_verifications').doc(uid).set({
    otp,
    email,
    expiresAt,
    attempts: 0,
    createdAt: new Date(),
  });

  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"InTheSpace Hosting" <noreply@inthespace.online>',
    to: email,
    subject: `${otp} is your InTheSpace verification code`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#1a1a2e;margin-top:0">Email Verification</h2>
        <p>Hi <b>${name}</b>,</p>
        <p>Use the code below to verify your InTheSpace account:</p>
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

  return { sent: true };
}

/**
 * Verify an OTP code for a given user.
 * On success, deletes the OTP record.
 * @param {string} uid  - Firebase UID
 * @param {string} code - Code submitted by the user
 * @returns {{ valid: boolean, error?: string }}
 */
export async function verifyOTP(uid, code) {
  const docRef = adminDb.collection('otp_verifications').doc(uid);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }

  const data = doc.data();

  // Check expiry
  if (data.expiresAt.toMillis() < Date.now()) {
    await docRef.delete();
    return { valid: false, error: 'Verification code expired. Please request a new one.' };
  }

  // Check attempt limit
  if (data.attempts >= MAX_ATTEMPTS) {
    await docRef.delete();
    return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  // Check code
  if (data.otp !== String(code).trim()) {
    await docRef.update({ attempts: data.attempts + 1 });
    const remaining = MAX_ATTEMPTS - data.attempts - 1;
    return { valid: false, error: `Invalid code. ${remaining} attempt(s) remaining.` };
  }

  // Valid – clean up
  await docRef.delete();
  return { valid: true };
}
