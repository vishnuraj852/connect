import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, Button, List, ListItem, ListItemAvatar, Avatar, ListItemText, Typography, Box, IconButton } from '@mui/material';
import { PersonAdd as PersonAddIcon, Check as CheckIcon } from '@mui/icons-material';
import { ref, query, orderByChild, equalTo, get, set, push, onValue, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { useAuthStore } from '../store/useAuthStore';

interface AddFriendModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AddFriendModal({ open, onClose }: AddFriendModalProps) {
  const { user: currentUser } = useAuthStore();
  const [emailQuery, setEmailQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    const q = ref(db, 'friendRequests');
    const unsubscribe = onValue(q, (snapshot) => {
      const reqs: any[] = [];
      snapshot.forEach(child => {
        const data = child.val();
        if (data.receiverId === currentUser.uid && data.status === 'pending') {
          reqs.push({ id: child.key, ...data });
        }
      });
      setPendingRequests(reqs);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const handleSearch = async () => {
    const trimmedEmail = emailQuery.trim().toLowerCase();
    if (!trimmedEmail) return;
    if (trimmedEmail === currentUser?.email?.toLowerCase()) {
      setError("You cannot add yourself."); setSearchResult(null); return;
    }
    setError('');
    
    try {
      const snapshot = await get(ref(db, 'users'));
      if (!snapshot.exists()) {
        setSearchResult(null);
        setError("Database is empty.");
        return;
      }
      
      let foundUser = null;
      snapshot.forEach(child => {
        const val = child.val();
        if (val.email && val.email.toLowerCase() === trimmedEmail) {
          foundUser = val;
        }
      });

      if (foundUser) {
        setSearchResult(foundUser);
      } else {
        setSearchResult(null);
        setError("User not found.");
      }
    } catch (e: any) {
       console.error(e);
       setError(`Error: ${e.message}`);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult || !currentUser) return;

    const snap = await get(ref(db, 'friendRequests'));
    let exists = false;
    if (snap.exists()) {
       snap.forEach(child => {
          const val = child.val();
          if (val.senderId === currentUser.uid && val.receiverId === searchResult.uid && val.status === 'pending') {
              exists = true;
          }
       });
    }
    if (exists) { setError("Request pending already."); return; }

    const newReqRef = push(ref(db, 'friendRequests'));
    await set(newReqRef, {
      senderId: currentUser.uid,
      receiverId: searchResult.uid,
      senderName: currentUser.displayName,
      senderPhoto: currentUser.photoURL,
      status: 'pending',
      timestamp: serverTimestamp()
    });
    
    setEmailQuery('');
    setSearchResult(null);
    onClose();
  };

  const handleAccept = async (request: any) => {
    if (!currentUser) return;
    await set(ref(db, `friendRequests/${request.id}/status`), 'accepted');
    
    const newChatRef = push(ref(db, 'chats'));
    await set(newChatRef, {
      participantIds: { [request.senderId]: true, [request.receiverId]: true },
      participantsData: {
        [request.senderId]: { name: request.senderName, photo: request.senderPhoto, uid: request.senderId },
        [request.receiverId]: { name: currentUser.displayName, photo: currentUser.photoURL, uid: currentUser.uid }
      },
      lastMessage: "Chat created",
      lastMessageTime: serverTimestamp()
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add Friends & Requests</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
           <TextField 
             size="small" 
             fullWidth 
             label="Search user by exact email" 
             value={emailQuery} 
             onChange={(e) => setEmailQuery(e.target.value)} 
             onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
           />
           <Button variant="contained" onClick={handleSearch}>Search</Button>
        </Box>
        {error && <Typography color="error" variant="body2">{error}</Typography>}
        
        {searchResult && (
          <List>
            <ListItem secondaryAction={<Button startIcon={<PersonAddIcon/>} variant="outlined" onClick={handleSendRequest}>Add</Button>}>
              <ListItemAvatar>
                <Avatar src={searchResult.photoURL} />
              </ListItemAvatar>
              <ListItemText primary={searchResult.displayName} secondary={searchResult.email} />
            </ListItem>
          </List>
        )}

        {pendingRequests.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Pending Requests</Typography>
            <List>
              {pendingRequests.map((req) => (
                <ListItem key={req.id}>
                   <ListItemAvatar><Avatar src={req.senderPhoto}/></ListItemAvatar>
                   <ListItemText primary={req.senderName} secondary="Sent you a friend request" />
                   <IconButton color="success" onClick={() => handleAccept(req)}><CheckIcon/></IconButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
