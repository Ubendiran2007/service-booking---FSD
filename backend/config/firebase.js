import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

/**
 * Note: For production, you should use a service account JSON file.
 * We'll attempt to initialize with credentials from environment variables 
 * or a minimal fallback if not available to ensure the backend starts without errors.
 */

function loadServiceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim()) {
    const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
    return JSON.parse(raw);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) {
    const raw = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf-8');
    return JSON.parse(raw);
  }

  return null;
}

try {
  const serviceAccount = loadServiceAccountFromEnv();
  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Minimal fallback (local dev). In production, provide a service account.
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'servicebookschedule' });
  }
} catch (error) {
  console.error('Firebase Admin Initialization Error:', error?.message || String(error));
  throw error;
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
