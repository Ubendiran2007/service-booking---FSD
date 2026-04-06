import { initializeApp } from "firebase/app";
import { getFirestore, setDoc, doc } from "firebase/firestore";
import firebaseConfig from "./frontend/firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const sampleWorkers = [
  {
    uid: "worker_1",
    email: "john.plumber@example.com",
    role: "worker",
    status: "active",
    profile: {
      name: "John Smith",
      phone: "+1 234 567 8901",
      address: "45 Water St, City",
      category: "plumber",
      rating: 4.8,
      totalReviews: 12
    },
    createdAt: new Date().toISOString()
  },
  {
    uid: "worker_2",
    email: "sarah.spark@example.com",
    role: "worker",
    status: "active",
    profile: {
      name: "Sarah Spark",
      phone: "+1 234 567 8902",
      address: "12 Power Lane, City",
      category: "electrician",
      rating: 4.9,
      totalReviews: 25
    },
    createdAt: new Date().toISOString()
  },
  {
    uid: "worker_3",
    email: "mike.mechanic@example.com",
    role: "worker",
    status: "active",
    profile: {
      name: "Mike Gear",
      phone: "+1 234 567 8903",
      address: "88 Garage Blvd, City",
      category: "mechanic",
      rating: 4.5,
      totalReviews: 8
    },
    createdAt: new Date().toISOString()
  },
  {
    uid: "worker_4",
    email: "anna.tidy@example.com",
    role: "worker",
    status: "pending",
    profile: {
      name: "Anna Clean",
      phone: "+1 234 567 8904",
      address: "7 Shine St, City",
      category: "house keeping",
      rating: 0,
      totalReviews: 0
    },
    createdAt: new Date().toISOString()
  },
  {
    uid: "worker_5",
    email: "bob.build@example.com",
    role: "worker",
    status: "active",
    profile: {
      name: "Bob Wood",
      phone: "+1 234 567 8905",
      address: "22 Plank Rd, City",
      category: "carpenter",
      rating: 4.7,
      totalReviews: 15
    },
    createdAt: new Date().toISOString()
  }
];

async function seed() {
  console.log("Seeding data...");
  for (const worker of sampleWorkers) {
    try {
      await setDoc(doc(db, "users", worker.uid), worker);
      console.log(`Added worker: ${worker.profile.name}`);
    } catch (err) {
      console.error(`Error adding ${worker.profile.name}:`, err);
    }
  }
  
  // Add an admin for testing if not exists
  const admin = {
      uid: "admin_1",
      email: "admin@serviflow.com",
      role: "admin",
      status: "active",
      profile: {
          name: "System Admin",
          phone: "000-000-0000",
          address: "HQ, Silicon Valley"
      },
      createdAt: new Date().toISOString()
  };
  
  try {
      await setDoc(doc(db, "users", admin.uid), admin);
      console.log("Added Admin user");
  } catch (err) {
      console.error("Error adding admin:", err);
  }

  console.log("Seeding complete!");
  process.exit();
}

seed();
