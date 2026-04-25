import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, set, serverTimestamp, onValue, onDisconnect } from 'firebase/database';
import { auth, db } from './firebase';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { createAppTheme } from './theme';

import Login from './pages/Login';
import ChatLayout from './pages/ChatLayout';

function App() {
  const { mode } = useThemeStore();
  const theme = createAppTheme(mode);
  const { setUser, user, loading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const userRef = ref(db, `users/${currentUser.uid}`);
        const connectedRef = ref(db, '.info/connected');

        onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            onDisconnect(userRef).update({
              isOnline: false,
              lastSeen: serverTimestamp()
            }).then(() => {
              set(userRef, {
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL,
                isOnline: true,
                lastSeen: serverTimestamp()
              }).catch(e => console.error("Error setting user document:", e));
            });
          }
        });
      }
      
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, [setUser]);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
         <CssBaseline />
         <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
         </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/*" element={user ? <ChatLayout /> : <Navigate to="/login" />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
