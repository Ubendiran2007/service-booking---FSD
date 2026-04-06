import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkConnection() {
  console.log("Checking Firestore connection...");
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    console.log(`Connection successful! Found ${usersSnapshot.size} total users.`);
    
    const bookingsSnapshot = await getDocs(collection(db, "bookings"));
    console.log(`Found ${bookingsSnapshot.size} total bookings.`);
    
    console.log("\n--- Active Roles in DB ---");
    const roles: Record<string, number> = {};
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      roles[data.role] = (roles[data.role] || 0) + 1;
    });
    
    Object.entries(roles).forEach(([role, count]) => {
      console.log(`- ${role.charAt(0).toUpperCase() + role.slice(1)}s: ${count}`);
    });
    
  } catch (err) {
    console.error("Firestore connection failed:", err);
  }
  process.exit();
}

checkConnection();
