import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(readFileSync(join(__dirname, '../../firebase-applet-config.json'), 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.projectId
});

const db = admin.firestore();

const seedData = async () => {
    console.log('🌱 Starting Seed...');
    
    // 1. Create Admin
    await db.collection('users').doc('admin_001').set({
        email: 'admin@serviflow.com',
        role: 'admin',
        status: 'active',
        profile: { name: 'Platform Manager' },
        createdAt: new Date().toISOString()
    });

    // 2. Create Workers
    const workers = [
        {
            email: 'john.plumber@example.com',
            role: 'worker',
            status: 'active',
            profile: {
                name: 'John Plumber',
                phone: '1234567890',
                address: '10 High St, South London',
                category: 'plumber',
                rating: 4.8,
                totalReviews: 24
            }
        },
        {
            email: 'jane.cook@example.com',
            role: 'worker',
            status: 'pending',
            profile: {
                name: 'Jane Smith',
                phone: '9876543210',
                address: '5 West Rd, Bristol',
                category: 'house keeping',
                rating: 0,
                totalReviews: 0
            }
        }
    ];

    for (let i = 0; i < workers.length; i++) {
        await db.collection('users').doc(`worker_00${i+1}`).set({
            ...workers[i],
            createdAt: new Date().toISOString()
        });
    }

    // 3. Create Customers
    await db.collection('users').doc('customer_001').set({
        email: 'customer.jane@example.com',
        role: 'customer',
        status: 'active',
        profile: {
            name: 'Jane Doe',
            phone: '5550199',
            address: '42 Baker St, London'
        },
        createdAt: new Date().toISOString()
    });

    console.log('✅ Seed Complete!');
    process.exit(0);
};

seedData().catch(err => {
    console.error('❌ Seed Failed:', err);
    process.exit(1);
});
