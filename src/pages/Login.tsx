import { useState } from 'react';
import { Box, Button, Typography, Paper, useTheme, Alert } from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export default function Login() {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sign in. If in Incognito, try a normal window.');
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' 
          : 'linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={theme.palette.mode === 'dark' ? 24 : 8}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: 400,
          width: '100%',
          borderRadius: 4,
          background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          border: theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.5)',
        }}
      >
        <Typography variant="h4" fontWeight="800" gutterBottom sx={{ 
            background: 'linear-gradient(to right, #6366f1, #ec4899)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
        }}>
          Connet
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
          Connect with friends and chat in real-time.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 3, width: '100%', borderRadius: 2 }}>{error}</Alert>}

        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<GoogleIcon />}
          onClick={handleGoogleSignIn}
          sx={{
            py: 1.5,
            fontSize: '1.1rem',
            textTransform: 'none',
            borderRadius: 2,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 6px 20px rgba(99, 102, 241, 0.4)'
            }
          }}
        >
          Sign in with Google
        </Button>
      </Paper>
    </Box>
  );
}
