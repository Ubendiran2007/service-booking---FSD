/**
 * Seed workers across Tamil Nadu districts (Auth + Firestore).
 *
 * Prerequisites:
 *   1. Firebase Console → Project settings → Service accounts → Generate new private key
 *   2. Place your Firebase Admin SDK JSON in one of:
 *      - Project root: `servicebookschedule-firebase-adminsdk-fbsvc-16c72e229b.json` (or `serviceAccountKey.json`)
 *      - Or your Downloads folder with that same filename (auto-detected)
 *      - Or set: GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_PATH
 *
 * Run from repo root:
 *   cd backend && npm run seed:tn
 *
 * Login for each seeded worker (same password):
 *   Password: ServiFlowSeed2026!
 *   Emails: see console output (tn.<district>.<category>@seed-serviflow.example.com)
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_PASSWORD = 'ServiFlowSeed2026!';

/** Approximate city centers — small jitter applied so pins don’t stack */
const TN_DISTRICTS = [
  { key: 'chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { key: 'coimbatore', name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { key: 'madurai', name: 'Madurai', lat: 9.9252, lng: 78.1198 },
  { key: 'tiruchirappalli', name: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
  { key: 'salem', name: 'Salem', lat: 11.6643, lng: 78.146 },
  { key: 'tirunelveli', name: 'Tirunelveli', lat: 8.7139, lng: 77.7567 },
  { key: 'thoothukudi', name: 'Thoothukudi', lat: 8.7642, lng: 78.1348 },
  { key: 'erode', name: 'Erode', lat: 11.341, lng: 77.7172 },
  { key: 'vellore', name: 'Vellore', lat: 12.9165, lng: 79.1325 },
  { key: 'thanjavur', name: 'Thanjavur', lat: 10.7869, lng: 79.1378 },
  { key: 'dindigul', name: 'Dindigul', lat: 10.3629, lng: 77.9752 },
  { key: 'karur', name: 'Karur', lat: 10.9601, lng: 78.0763 },
  { key: 'hosur', name: 'Hosur', lat: 12.7409, lng: 77.8253 },
  { key: 'nagercoil', name: 'Nagercoil', lat: 8.1773, lng: 77.4344 },
  { key: 'ooty', name: 'Udhagamandalam (Ooty)', lat: 11.4102, lng: 76.695 },
  { key: 'cuddalore', name: 'Cuddalore', lat: 11.7447, lng: 79.768 },
  { key: 'ramanathapuram', name: 'Ramanathapuram', lat: 9.3639, lng: 78.8395 },
  { key: 'namakkal', name: 'Namakkal', lat: 11.2213, lng: 78.1652 },
  { key: 'theni', name: 'Theni', lat: 10.0104, lng: 77.4768 },
  { key: 'kanchipuram', name: 'Kanchipuram', lat: 12.8342, lng: 79.7036 },
];

const CATEGORIES = ['electrician', 'plumber', 'mechanic', 'house keeping', 'carpenter', 'painter'];

const DISPLAY_NAMES = [
  'Karthik R',
  'Priya Menon',
  'Senthil Kumar',
  'Lakshmi S',
  'Arun Prakash',
  'Deepa V',
  'Muthu Selvan',
  'Anitha Ramesh',
  'Vignesh T',
  'Keerthana S',
  'Balaji M',
  'Nithya K',
  'Gopinath R',
  'Swathi L',
  'Harish Kumar',
  'Indira P',
  'Suresh N',
  'Meena D',
  'Ravi Chandran',
  'Saranya G',
];

function jitter(lat, lng, seed) {
  const a = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5;
  const b = ((seed * 7919 + seed) % 233280) / 233280 - 0.5;
  return {
    lat: lat + a * 0.06,
    lng: lng + b * 0.06,
  };
}

const DEFAULT_ADMIN_SDK_NAME = 'servicebookschedule-firebase-adminsdk-fbsvc-16c72e229b.json';

function loadServiceAccount() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const candidates = [
    fromEnv,
    join(__dirname, '../../', DEFAULT_ADMIN_SDK_NAME),
    join(__dirname, '../../serviceAccountKey.json'),
    join(__dirname, '../serviceAccountKey.json'),
    join(homedir(), 'Downloads', DEFAULT_ADMIN_SDK_NAME),
  ].filter(Boolean);

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      if (j.private_key && j.client_email) return { data: j, path: p };
    } catch {
      /* next */
    }
  }
  return null;
}

function initAdmin() {
  const loaded = loadServiceAccount();
  if (!loaded) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  Missing Firebase Admin service account (JSON with private_key). ║
║  Download: Firebase Console → Project settings → Service         ║
║  accounts → Generate new private key → save as:                  ║
║    serviceAccountKey.json  (project root, next to frontend/)      ║
║  Or set: GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/key.json    ║
╚══════════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }
  const { data: sa, path: credPath } = loaded;
  console.log(`\n🔑 Using Admin SDK credentials: ${credPath}\n`);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id,
    });
  }
  return admin.firestore();
}

async function upsertWorker(db, { email, name, phone, districtLabel, location, category, index }) {
  let uid;
  try {
    const rec = await admin.auth().createUser({
      email,
      password: SEED_PASSWORD,
      displayName: name,
    });
    uid = rec.uid;
    console.log(`  ✓ Created Auth  ${email}`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const existing = await admin.auth().getUserByEmail(email);
      uid = existing.uid;
      console.log(`  ↻ Exists Auth   ${email} (refreshing Firestore)`);
    } else {
      throw e;
    }
  }

  const userDoc = {
    uid,
    email,
    role: 'worker',
    status: 'active',
    profile: {
      name,
      phone,
      address: `${districtLabel}, Tamil Nadu, India`,
      location,
      category,
      rating: Math.round((4.1 + (index % 10) * 0.08) * 10) / 10,
      totalReviews: 8 + (index % 25),
      isOnline: true,
      welcomeShown: true,
      verification: {
        status: 'verified',
        certificateUrls: [],
        skills: [category, `${districtLabel} local service`],
        experienceYears: 2 + (index % 8),
        adminRemarks: 'Seeded TN demo profile',
        reviewedAt: new Date().toISOString(),
      },
      serviceRadiusKm: 40,
      reliabilityScore: 88 + (index % 10),
      reliabilityStats: {
        cancellations: 0,
        delays: index % 3,
        onTimeCompletes: 12 + index,
      },
    },
    createdAt: new Date().toISOString(),
  };

  await db.collection('users').doc(uid).set(userDoc, { merge: true });
}

async function main() {
  const db = initAdmin();
  console.log(`\n🌴 Seeding ${TN_DISTRICTS.length} Tamil Nadu workers (one per district)…\n`);

  for (let i = 0; i < TN_DISTRICTS.length; i++) {
    const d = TN_DISTRICTS[i];
    const category = CATEGORIES[i % CATEGORIES.length];
    const loc = jitter(d.lat, d.lng, i + 1);
    const email = `tn.${d.key}.${category.replace(/\s+/g, '')}@seed-serviflow.example.com`;
    const name = `${DISPLAY_NAMES[i % DISPLAY_NAMES.length]} (${d.name})`;
    const phone = `+9198765${String(10000 + i).slice(-5)}`;

    console.log(`${i + 1}. ${d.name} — ${category}`);
    await upsertWorker(db, {
      email,
      name,
      phone,
      districtLabel: d.name,
      location: { lat: loc.lat, lng: loc.lng },
      category,
      index: i,
    });
  }

  console.log(`
✅ Done.

All accounts use the same password:  ${SEED_PASSWORD}

Emails look like:  tn.<district>.<category>@seed-serviflow.example.com
Example:           tn.chennai.electrician@seed-serviflow.example.com

Customers see workers when destination is within each worker’s service radius (~40 km).
Test from a customer location near a district center or temporarily raise serviceRadiusKm in Firestore.
`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
