// lib/firebase-rtdb.js - Firebase Realtime Database for job queue + real-time streaming
// Requires FIREBASE_DATABASE_URL env var
import admin from 'firebase-admin';
import './firebase-admin'; // ensure admin is initialized with databaseURL

export const rtdb = admin.database();
export default rtdb;
