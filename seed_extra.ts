import { initializeApp } from "firebase/app";
import { getFirestore, setDoc, doc, addDoc, collection } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const bookings = [
  {
    customerId: "customer_1",
    workerId: "worker_1",
    serviceType: "plumber",
    date: "2026-04-06",
    time: "10:00",
    status: "accepted",
    payment: { amount: 50, status: "pending" },
    createdAt: new Date().toISOString()
  },
  {
    customerId: "customer_2",
    workerId: "worker_2",
    serviceType: "electrician",
    date: "2026-04-05",
    time: "14:00",
    status: "completed",
    payment: { amount: 50, status: "paid" },
    feedback: { rating: 5, comment: "Excellent work, very professional!" },
    createdAt: new Date().toISOString()
  }
];

// Add some customers too
const customers = [
    {
        uid: "customer_1",
        email: "customer1@example.com",
        role: "customer",
        status: "active",
        profile: {
          name: "Alice Johnson",
          phone: "+1 234 567 1111",
          address: "10 Main St, Mumbai",
          location: { lat: 19.1415, lng: 72.8258 }
        },
        createdAt: new Date().toISOString()
    },
    {
        uid: "customer_2",
        email: "customer2@example.com",
        role: "customer",
        status: "active",
        profile: {
          name: "Mark Evans",
          phone: "+1 234 567 2222",
          address: "15 Side Rd, Mumbai",
          location: { lat: 19.0620, lng: 72.8428 }
        },
        createdAt: new Date().toISOString()
    }
];

async function seed() {
  console.log("Seeding customers and bookings...");
  for (const c of customers) {
    await setDoc(doc(db, "users", c.uid), c);
    console.log(`Added customer: ${c.profile.name}`);
  }
  
  for (const b of bookings) {
    await addDoc(collection(db, "bookings"), b);
    console.log(`Added booking for ${b.serviceType}`);
  }
  
  console.log("Seeding complete!");
  process.exit();
}

seed();
