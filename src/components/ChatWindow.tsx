import { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, IconButton, Avatar, Paper } from '@mui/material';
import { Send as SendIcon, DeleteOutline as DeleteIcon, FiberManualRecord as CircleIcon, Call as PhoneIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { ref, onValue, push, set, remove, serverTimestamp, increment } from 'firebase/database';
import { db } from '../firebase';
import { useAuthStore } from '../store/useAuthStore';
import { toneGenerator } from '../audioEffects';

interface ChatWindowProps {
  chat: any;
  onInitiateCall: (chatId: string, type: 'video' | 'voice', otherId: string, otherName: string) => void;
  onBack?: () => void;
}

export default function ChatWindow({ chat, onInitiateCall, onBack }: ChatWindowProps) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const otherId = chat?.participantIds ? Object.keys(chat.participantIds).find(id => id !== user?.uid) : null;
  const otherUser = otherId ? chat.participantsData?.[otherId] : { name: 'Unknown', photo: '' };

  useEffect(() => {
    if (!otherId) return;
    const unsub = onValue(ref(db, `users/${otherId}/isOnline`), (snap) => {
      setIsOtherOnline(snap.val() === true);
    });
    return () => unsub();
  }, [otherId]);

  useEffect(() => {
    if (!chat || !user) return;
    set(ref(db, `chats/${chat.id}/unreadCounts/${user.uid}`), 0).catch(console.error);

    const unsub = onValue(ref(db, `messages/${chat.id}`), (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(child => {
        loaded.push({ id: child.key, ...child.val() });
      });

      setMessages(prev => {
         if (prev.length > 0 && loaded.length > prev.length) {
             const lastMsg = loaded[loaded.length - 1];
             if (lastMsg.senderId !== user.uid) {
                 toneGenerator.playMessageNotification();
                 if (document.hidden && 'Notification' in window && window.Notification.permission === 'granted') {
                     new window.Notification('New Message', { body: `${otherUser?.name || 'Someone'}: ${lastMsg.text}` });
                 }
             }
         }
         return loaded;
      });

      set(ref(db, `chats/${chat.id}/unreadCounts/${user.uid}`), 0).catch(console.error);
    });
    return () => unsub();
  }, [chat, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !chat || !otherId) return;
    const text = newMessage.trim();
    setNewMessage('');
    
    const msgRef = push(ref(db, `messages/${chat.id}`));
    await set(msgRef, {
      senderId: user.uid,
      text,
      timestamp: serverTimestamp()
    });

    await set(ref(db, `chats/${chat.id}/lastMessage`), text);
    await set(ref(db, `chats/${chat.id}/lastMessageTime`), serverTimestamp());
    await set(ref(db, `chats/${chat.id}/unreadCounts/${otherId}`), increment(1));
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to permanently clear this chat history for both of you?")) {
      await remove(ref(db, `messages/${chat.id}`));
      await set(ref(db, `chats/${chat.id}/lastMessage`), 'Chat cleared');
      await set(ref(db, `chats/${chat.id}/lastMessageTime`), serverTimestamp());
      await set(ref(db, `chats/${chat.id}/unreadCounts`), null);
    }
  };

  if (!chat) {
    return (
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <Typography color="text.secondary" variant="h6">Select a friend to start chatting</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default', position: 'relative' }}>
      
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper', zIndex: 10 }}>
         {onBack && (
           <IconButton onClick={onBack} sx={{ display: { xs: 'flex', md: 'none' }, mr: -1 }}>
             <ArrowBackIcon />
           </IconButton>
         )}
         <Avatar src={otherUser?.photo} />
         <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight="bold" sx={{ lineHeight: 1 }}>{otherUser?.name}</Typography>
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }} color={isOtherOnline ? "success.main" : "text.secondary"}>
               <CircleIcon sx={{ fontSize: 10 }} />
               {isOtherOnline ? "Online" : "Offline"}
            </Typography>
         </Box>
         <IconButton color="primary" title="Voice Call" onClick={() => onInitiateCall(chat.id, 'voice', otherId!, otherUser?.name || 'Unknown')}>
            <PhoneIcon />
         </IconButton>
         {/* <IconButton color="primary" title="Video Call" onClick={() => onInitiateCall(chat.id, 'video', otherId!, otherUser?.name || 'Unknown')}>
            <VideoIcon />
         </IconButton> */}
         <IconButton color="error" title="Clear Chat" onClick={handleClearChat}>
            <DeleteIcon />
         </IconButton>
      </Box>
      
      {/* Messages */}
      <Box sx={{ flexGrow: 1, p: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.length === 0 ? (
           <Typography sx={{ textAlign: 'center', color: 'text.secondary', mt: 4 }}>No messages yet. Send a 'Hi'!</Typography>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === user?.uid;
            return (
              <Box key={msg.id} sx={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                 <Paper 
                   elevation={0}
                   sx={{ 
                     p: 2, 
                     maxWidth: '70%', 
                     borderRadius: 3,
                     borderBottomRightRadius: isMe ? 0 : 3,
                     borderTopLeftRadius: !isMe ? 0 : 3,
                     bgcolor: isMe ? 'primary.main' : 'background.paper',
                     color: isMe ? 'primary.contrastText' : 'text.primary',
                     boxShadow: isMe ? '0 4px 14px rgba(99, 102, 241, 0.4)' : '0 2px 8px rgba(0,0,0,0.05)'
                   }}
                 >
                   <Typography variant="body1">{msg.text}</Typography>
                 </Paper>
              </Box>
            );
          })
        )}
        <div ref={endRef} />
      </Box>

      {/* Input */}
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
         <TextField 
           fullWidth 
           size="small" 
           variant="outlined" 
           placeholder="Type a message..." 
           value={newMessage}
           onChange={e => setNewMessage(e.target.value)}
           onKeyDown={e => e.key === 'Enter' && handleSend()}
         />
         <IconButton color="primary" onClick={handleSend} disabled={!newMessage.trim()}>
           <SendIcon />
         </IconButton>
      </Box>
    </Box>
  );
}
