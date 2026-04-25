# Connet - Real-Time Chat App

Connet is a modern, responsive real-time chat application built with React, TypeScript, and Firebase. It features instant messaging, online presence tracking, audio notification alerts, peer-to-peer WebRTC voice/video calls, and a sleek modern interface with dark mode support.

## Features

- **Authentication:** Secure Google Sign-In using Firebase Auth.
- **Real-Time Messaging:** Instant message delivery powered by Firebase Realtime Database.
- **Online Presence:** See when your friends are actively online in real-time.
- **Audio Notifications:** Subtle auto-synthesized notification sounds for new messages using the Web Audio API.
- **Voice/Video Calling:** Built-in peer-to-peer calling using WebRTC and Firebase as a signaling server.
- **Light/Dark Mode:** Dynamic theming customized via Material-UI and managed by Zustand.
- **Mobile Responsive:** Fluid UI that gracefully adapts to mobile and tablet screens, optimizing screen real estate through responsive app bar collapsing and sidebars.

## Tech Stack

- **Frontend Framework:** React 18 with Vite
- **Language:** TypeScript
- **Styling:** Material-UI (MUI)
- **State Management:** Zustand
- **Backend/Authentication:** Firebase (Auth, Realtime Database)
- **Audio/Video APIs:** WebRTC & Web Audio API

## Architecture & How It Works

1. **Authentication:** When a user logs in via Google, their user profile is stored or updated in the `users/` node of the Firebase Realtime Database.
2. **Presence System:** The app binds to Firebase's native `.info/connected` state to listen to the user's connection status. Realtime disconnect handlers using `onDisconnect()` ensure users are automatically marked offline if their connection drops or they close the browser.
3. **Chat Data Model:** Users create pairwise connections labeled as `chats`. Each chat maintains unread counts and a snippet of the latest message for the UI. Actual messages are pushed to the `messages/{chatId}/` node. 
4. **Listener-based Subscriptions:** The application stays in-sync globally via component-level Firebase `onValue` hooks ensuring all logged-in views are strictly real-time and immutable.
5. **Notifications:** When a new message appears in the database and the receiving user does not have that chat actively open (or is viewing the sidebar), the `audioEffects.ts` synthesizer maps an elegant sine-wave "pop" alert sound. 
6. **WebRTC Calling:** Audio and video calls exchange standard session descriptions (SDP offers/answers) and ICE candidates through a dedicated `calls/{chatId}` Firebase node so peer connections can be directly and securely established between browsers.

## Installation & Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+ recommended)
- A Firebase project with **Authentication (Google Provider)** and **Realtime Database** enabled.

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/chat-app.git
cd chat-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root of your project. You can duplicate the provided `.env.example` template:

```bash
cp .env.example .env
```

Populate the `.env` file with your specific Firebase SDK credentials. You can find these in your Firebase application's Project Settings.

```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
VITE_FIREBASE_DATABASE_URL="your-database-url"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
VITE_FIREBASE_MEASUREMENT_ID="your-measurement-id"
```

### 4. Build and Run

To start the local development server:
```bash
npm run dev
```
The application will inherently be accessible at `http://localhost:5173`. 

To create a production build:
```bash
npm run build
```
