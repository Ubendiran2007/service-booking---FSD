# ServiFlow: Service Booking & Scheduling System

ServiFlow is a modern, full-stack service platform designed to connect professional service workers (electricians, plumbers, etc.) with customers. It features a robust, real-time dashboard system with role-based access control and interactive location mapping.

## 🚀 Tech Stack

- **Frontend**: React (SPAs), Vite (Build/Dev), Tailwind CSS v4 (Styling)
- **Backend-as-a-Service**: Firebase Core, Firestore (NoSQL Database), Firebase Authentication
- **Mapping**: Leaflet with OpenStreetMap
- **Animations**: Framer Motion (motion/react)
- **State Management**: React Hooks + Firebase Live Data (`onSnapshot`)

---

## 🏗 System Architecture

ServiFlow uses a client-centric architecture where the frontend interacts directly with Firebase services for real-time updates.

### 👥 User Roles

#### 1. Customer
- **Search & Filter**: Find verified professionals by category (Plumber, Electrician, etc.) or name.
- **Booking**: Real-time service scheduling with specific date/time and GPS location capture.
- **Feedback & Payment**: Pay for completed services and provide ratings/reviews.

#### 2. Worker
- **Task Management**: Real-time notifications for new service requests.
- **Live Mapping**: Interactive route visualization showing the midpoint between the worker's current location and the customer's address.
- **Earnings Tracking**: Monitor performance through customer ratings and total earnings.

#### 3. Admin
- **Compliance**: Approve or reject new worker registrations.
- **Monitoring**: Platform-wide visibility of all active and completed bookings.
- **Stats Dashboard**: Overview of platform health and approval queues.

---

## 📊 Data Model (Firestore)

### `/users/{userId}`
Stores profile information and user roles.
```json
{
  "uid": "string",
  "email": "string",
  "role": "admin | customer | worker",
  "status": "pending | active",
  "profile": {
    "name": "string",
    "phone": "string",
    "address": "string",
    "location": { "lat": 19.07, "lng": 72.87 },
    "category": "string (for workers)",
    "rating": 4.8,
    "totalReviews": 12
  }
}
```

### `/bookings/{bookingId}`
Stores individual service transactions.
```json
{
  "customerId": "string",
  "workerId": "string",
  "serviceType": "string",
  "date": "2026-04-06",
  "time": "10:00",
  "status": "pending | accepted | rejected | completed",
  "payment": { "amount": 50, "status": "pending | paid" },
  "feedback": { "rating": 5, "comment": "Excellent work!" }
}
```

---

## 🛠 Installation & Local Development

### Prerequisites
- Node.js (v18+)
- Firebase Project (configured via `firebase-applet-config.json`)

### Setup Instructions

1. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Database Seeding**:
   To populate the database with realistic Mumbai-based demo data:
   ```bash
   # In the root directory
   npx tsx seed_extra.ts
   npx tsx seed.ts
   ```

3. **Run Locally**:
   ```bash
   # From root
   npm run dev
   ```
   The app will be accessible at `http://localhost:3000`.

---

## 🗺 Interactive Mapping Feature

The project implements a custom `MapComponent` using `react-leaflet`. It handles:
- **Dual Markers**: Displays both Worker and Customer locations.
- **Midpoint Centering**: Calculates the optimal map center to keep both parties in view.
- **Route Visualization**: Draws a dashed polyline route between locations for better visual context.
- **GPS Capture**: Integrated into Registration and Booking workflows for real-world precision.

---

## 🎨 UI/UX Design

The application uses a premium, SaaS-grade design system:
- **Aesthetic**: Glassmorphism effects, modern typography (Inter), and vibrant color palettes.
- **Animations**: Subtle micro-interactions for buttons, modals, and list items using Framer Motion.
- **Responsive**: Fully optimized for mobile use - critical for service workers on the go.
