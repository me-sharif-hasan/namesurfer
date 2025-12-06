// lib/firebase-admin.js - Server-side Firebase Admin SDK
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin SDK (singleton pattern)
if (!admin.apps.length) {
  // Option 1: Use service account JSON file (recommended)
  const serviceAccountPath = path.join(process.cwd(), 'firebase-admin-key.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } 
  // Option 2: Use individual environment variables (fallback)
  else if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
  }
  // Option 3: Use default credentials (for Google Cloud deployment)
  else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
}

// Server-side Firestore with full access
export const adminDb = admin.firestore();

// Server-side Auth for token verification
export const adminAuth = admin.auth();

export default admin;
