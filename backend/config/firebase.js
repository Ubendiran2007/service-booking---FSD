import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Note: For production, you should use a service account JSON file.
 * We'll attempt to initialize with credentials from environment variables 
 * or a minimal fallback if not available to ensure the backend starts without errors.
 */

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        // Fallback for local development if running within a project context
        // This will allow it to start even if credentials aren't fully configured
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'servicebookschedule'
        });
    }
} catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
    // Initialize without credentials only to keep server alive
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
