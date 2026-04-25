import { useState, useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ref, onValue, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuthStore } from '../store/useAuthStore';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import CallWindow from '../components/CallWindow';
import { toneGenerator } from '../audioEffects';

export default function ChatLayout() {
  const { user } = useAuthStore();
  const [selectedChat, setSelectedChat] = useState<any>(null);
  
  // GLOBAL CALL STATE
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<{ chatId: string, isCaller: boolean, type: 'video'|'voice', otherName: string, otherId: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(db, `users/${user.uid}/incomingCall`), snap => {
       setIncomingCall(snap.val());
       if (snap.val() && !activeCall) {
          toneGenerator.startRingTone();
       } else {
          toneGenerator.stop();
       }
    });

    return () => { unsub(); toneGenerator.stop(); };
  }, [user, activeCall]);

  const acceptCall = async () => {
     if (!incomingCall) return;
     const call = incomingCall;
     toneGenerator.stop();
     
     await set(ref(db, `calls/${call.chatId}/status`), 'connected');
     await remove(ref(db, `users/${user?.uid}/incomingCall`));
     
     setActiveCall({ chatId: call.chatId, isCaller: false, type: call.type, otherName: call.callerName, otherId: call.callerId });
  };

  const declineCall = async () => {
      toneGenerator.stop();
      if (incomingCall) {
          await set(ref(db, `calls/${incomingCall.chatId}/status`), 'ended');
          await remove(ref(db, `users/${user?.uid}/incomingCall`));
      }
      setIncomingCall(null);
  };

  const initiateCall = async (chatId: string, type: 'video' | 'voice', otherId: string, otherName: string) => {
      // 1. Create WebRTC signal room
      await set(ref(db, `calls/${chatId}`), { status: 'ringing', callerId: user?.uid, type });
      
      // 2. Trigger the exact receiver's global ringing modal with our info
      await set(ref(db, `users/${otherId}/incomingCall`), { 
          chatId, 
          callerName: user?.displayName || 'Someone', 
          callerId: user?.uid,
          type 
      });
      
      // 3. Mount UI natively for the caller instantly
      setActiveCall({ chatId, isCaller: true, type, otherName, otherId });
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: 'background.default', overflow: 'hidden', position: 'relative' }}>
      
      {incomingCall && !activeCall && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.9)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
           <Typography variant="h4" color="white">{incomingCall.callerName}</Typography>
           <Typography variant="h6" color="primary">Incoming {incomingCall.type} call...</Typography>
           <Box sx={{ display: 'flex', gap: 3, mt: 3 }}>
               <Button variant="contained" color="success" size="large" onClick={acceptCall} sx={{ borderRadius: 8, px: 4 }}>Accept</Button>
               <Button variant="contained" color="error" size="large" onClick={declineCall} sx={{ borderRadius: 8, px: 4 }}>Decline</Button>
           </Box>
        </Box>
      )}

      {activeCall && (
        <CallWindow 
           chatId={activeCall.chatId} 
           isCaller={activeCall.isCaller} 
           type={activeCall.type} 
           otherUserName={activeCall.otherName}
           otherUserId={activeCall.otherId}
           onEnd={() => setActiveCall(null)} 
        />
      )}

      <Box sx={{ 
          display: { xs: selectedChat ? 'none' : 'flex', md: 'flex' },
          width: { xs: '100%', md: 'auto' },
          height: '100%'
      }}>
        <Sidebar onSelectChat={setSelectedChat} selectedChatId={selectedChat?.id} />
      </Box>

      <Box sx={{ 
          display: { xs: selectedChat ? 'flex' : 'none', md: 'flex' },
          flexGrow: 1,
          height: '100%',
          width: { xs: '100%', md: 'auto' }
      }}>
        <ChatWindow chat={selectedChat} onInitiateCall={initiateCall} onBack={() => setSelectedChat(null)} />
      </Box>
    </Box>
  );
}
