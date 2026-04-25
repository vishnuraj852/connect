import { useState, useEffect, useRef } from 'react';
import { Box, List, ListItemAvatar, Avatar, ListItemText, Typography, Divider, IconButton, ListItemButton, Badge } from '@mui/material';
import { Add as AddIcon, Logout as LogoutIcon, Brightness4, Brightness7 } from '@mui/icons-material';
import { ref, onValue } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import AddFriendModal from './AddFriendModal';

// Small styled dot for avatar badge
import { styled } from '@mui/material/styles';
const OnlineBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: '#44b700',
    color: '#44b700',
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    '&::after': {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      animation: 'ripple 1.2s infinite ease-in-out',
      border: '1px solid currentColor',
      content: '""',
    },
  },
  '@keyframes ripple': {
    '0%': { transform: 'scale(.8)', opacity: 1 },
    '100%': { transform: 'scale(2.4)', opacity: 0 },
  },
}));

export default function Sidebar({ onSelectChat, selectedChatId }: { onSelectChat: (chat: any) => void, selectedChatId?: string }) {
  const { user } = useAuthStore();
  const { mode, toggleMode } = useThemeStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [onlineStatusMap, setOnlineStatusMap] = useState<Record<string, boolean>>({});

  const isInitialLoad = useRef(true);
  const [, setPrevUnreads] = useState<Record<string, number>>({});
  const selectedChatRef = useRef(selectedChatId);
  useEffect(() => { selectedChatRef.current = selectedChatId; }, [selectedChatId]);

  useEffect(() => {
    // Listen to users for global online map
    const unsub = onValue(ref(db, 'users'), (snap) => {
       const map: Record<string, boolean> = {};
       snap.forEach(child => {
           map[child.val().uid] = child.val().isOnline === true;
       });
       setOnlineStatusMap(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(db, 'chats'), (snapshot) => {
      const loadedChats: any[] = [];
      const newUnreads: Record<string, number> = {};

      snapshot.forEach(child => {
        const data = child.val();
        if (data.participantIds && data.participantIds[user.uid]) {
          loadedChats.push({ id: child.key, ...data });
          newUnreads[child.key] = data.unreadCounts?.[user.uid] || 0;
        }
      });
      loadedChats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      setChats(loadedChats);

      setPrevUnreads(prev => {
        if (!isInitialLoad.current) {
            for (const chatId in newUnreads) {
                if (chatId !== selectedChatRef.current && newUnreads[chatId] > (prev[chatId] || 0)) {
                    import('../audioEffects').then(m => m.toneGenerator.playMessageNotification());
                    break;
                }
            }
        }
        isInitialLoad.current = false;
        return newUnreads;
      });

    });
    return () => unsub();
  }, [user]);

  const getOtherParticipant = (chat: any) => {
    if (!chat || !chat.participantIds) return { name: 'Unknown', photo: '' };
    const otherId = Object.keys(chat.participantIds).find(id => id !== user?.uid);
    return chat.participantsData?.[otherId as string] || { name: 'Unknown', photo: '' };
  };

  return (
    <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0, borderRight: { xs: 0, md: 1 }, borderColor: 'divider', display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <Typography variant="h6" fontWeight="bold">Messages</Typography>
         <IconButton size="small" color="primary" onClick={() => setModalOpen(true)}>
            <AddIcon/>
         </IconButton>
      </Box>
      <Divider />
      
      <List sx={{ flexGrow: 1, overflowY: 'auto' }}>
         {chats.map(chat => {
           const friend = getOtherParticipant(chat);
           const isOnline = onlineStatusMap[friend.uid];
           const unreadCount = chat.unreadCounts?.[user?.uid || ''] || 0;

           return (
             <ListItemButton key={chat.id} onClick={() => onSelectChat(chat)}>
               <ListItemAvatar>
                  {isOnline ? (
                    <OnlineBadge overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} variant="dot">
                       <Avatar src={friend.photo} />
                    </OnlineBadge>
                  ) : (
                    <Avatar src={friend.photo} />
                  )}
               </ListItemAvatar>
               <ListItemText 
                 primary={
                   <Typography component="span" variant="body1" fontWeight={unreadCount > 0 ? "bold" : "normal"}>
                     {friend.name}
                   </Typography>
                 }
                 secondary={chat.lastMessage || 'New chat! Say hi.'} 
                 secondaryTypographyProps={{ 
                   noWrap: true, 
                   fontWeight: unreadCount > 0 ? "bold" : "normal",
                   color: unreadCount > 0 ? 'text.primary' : 'text.secondary' 
                 }}
               />
               {unreadCount > 0 && (
                  <Badge badgeContent={unreadCount} color="error" sx={{ mr: 2 }} />
               )}
             </ListItemButton>
           )
         })}
      </List>

      <Divider />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar src={user?.photoURL || ''} />
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
           <Typography variant="subtitle2" noWrap>{user?.displayName}</Typography>
           <Typography variant="caption" color="text.secondary">Online</Typography>
        </Box>
        <IconButton size="small" onClick={toggleMode}>
          {mode === 'dark' ? <Brightness7 fontSize="small" /> : <Brightness4 fontSize="small" />}
        </IconButton>
        <IconButton size="small" color="error" onClick={() => signOut(auth)}>
           <LogoutIcon fontSize="small"/>
        </IconButton>
      </Box>

      <AddFriendModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Box>
  );
}
