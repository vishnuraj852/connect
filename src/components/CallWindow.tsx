import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography, CircularProgress, Avatar, Dialog, Button } from '@mui/material';
import { CallEnd, Mic, MicOff, Videocam, VideocamOff, Phone } from '@mui/icons-material';
import { ref, onValue, set, push, remove, onDisconnect, onChildAdded, off } from 'firebase/database';
import { db } from '../firebase';
import { useAuthStore } from '../store/useAuthStore';
import { toneGenerator } from '../audioEffects';

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ]
};

interface CallWindowProps {
  chatId: string;
  isCaller: boolean;
  type: 'video' | 'voice';
  otherUserName: string;
  otherUserId: string;
  onEnd: () => void;
}

export default function CallWindow({ chatId, isCaller, type, otherUserName, otherUserId, onEnd }: CallWindowProps) {
  const { user } = useAuthStore();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'voice');
  const [callStatus, setCallStatus] = useState(isCaller ? 'Calling (Dialing)...' : 'Connecting...');
  const [playBlocked, setPlayBlocked] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  
  // Cleanup refs
  const unsubcribeRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    let stopAudio = () => {};
    if (isCaller && callStatus.includes('Calling')) {
        stopAudio = toneGenerator.startDialTone();
    }
    return () => { stopAudio(); toneGenerator.stop(); };
  }, [isCaller, callStatus]);

  useEffect(() => {
     if (remoteStream && remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
         remoteVideoRef.current.srcObject = remoteStream;
         remoteVideoRef.current.play().catch(e => {
             console.log("Playback blocked by browser:", e);
             setPlayBlocked(true);
         });
     }
  });

  const forcePlay = () => {
     if (remoteVideoRef.current) remoteVideoRef.current.play().catch(e => console.error(e));
     if (remoteAudioRef.current) {
         remoteAudioRef.current.play()
            .then(() => setPlayBlocked(false))
            .catch(e => console.error(e));
     }
  };

  useEffect(() => {
    if (!user) return;
    let pc: RTCPeerConnection;
    let myStream: MediaStream;

    const setupCall = async () => {
      try {
        // 1. Get Hardware hardware stream
        myStream = await navigator.mediaDevices.getUserMedia({
          video: type === 'video',
          audio: true
        });
        setLocalStream(myStream);
        if (localVideoRef.current) localVideoRef.current.srcObject = myStream;

        // 2. Initialize RTCPeerConnection
        pc = new RTCPeerConnection(servers);
        pcRef.current = pc;
        
        // Reverting to pure addTrack for native implicit symmetric negotiation
        myStream.getTracks().forEach(track => pc.addTrack(track, myStream));

        // Listen for Remote Tracks explicitly isolating decoders
        pc.ontrack = (event) => {
            if (event.track.kind === 'audio') {
                 if (remoteAudioRef.current) {
                     remoteAudioRef.current.srcObject = new MediaStream([event.track]);
                     remoteAudioRef.current.play().catch(e => setPlayBlocked(true));
                     
                     remoteAudioRef.current.onpause = () => setPlayBlocked(true);
                     remoteAudioRef.current.onplaying = () => setPlayBlocked(false);
                 }
            } else if (event.track.kind === 'video') {
                 if (remoteVideoRef.current) {
                     remoteVideoRef.current.srcObject = new MediaStream([event.track]);
                     remoteVideoRef.current.play().catch(e => setPlayBlocked(true));
                 }
            }

            // Clean react state representation for diagnostic UI overlay
            setRemoteStream(prev => {
                const s = prev || new MediaStream();
                if (!s.getTracks().find(t => t.id === event.track.id)) {
                    s.addTrack(event.track);
                }
                return new MediaStream(s.getTracks());
            });
        };

        // DB Refs for Signaling
        const callRef = ref(db, `calls/${chatId}`);
        const offerCandidatesRef = ref(db, `calls/${chatId}/offerCandidates`);
        const answerCandidatesRef = ref(db, `calls/${chatId}/answerCandidates`);
        
        // Ensure call shuts down securely if we randomly disconnect
        const disconnectRef = onDisconnect(callRef);
        disconnectRef.remove();

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            push(isCaller ? offerCandidatesRef : answerCandidatesRef, event.candidate.toJSON());
          }
        };

        pc.onconnectionstatechange = () => {
           if (pc.connectionState === 'connected') {
               toneGenerator.stop();
               setCallStatus('Connected');
               
               setTimeout(() => {
                   if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                        remoteVideoRef.current.play().catch(e => setPlayBlocked(true));
                   }
                   if (remoteAudioRef.current && remoteAudioRef.current.paused) {
                        remoteAudioRef.current.play().catch(e => setPlayBlocked(true));
                   }
               }, 500);
           }
           if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') handleHangup();
        };

        const remoteIceQueue: RTCIceCandidateInit[] = [];
        
        // Polling event architectural overhaul to bypass extreme Firebase nested spam crashing UDP
        const bindIceListener = (refPath: any) => {
            const listener = onChildAdded(refPath, (snap) => {
                const candidateData = snap.val();
                if (!candidateData) return;
                
                if (pc.remoteDescription) {
                    pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => console.error(e));
                } else {
                    remoteIceQueue.push(candidateData);
                }
            });
            unsubcribeRefs.current.push(() => off(refPath, 'child_added', listener));
        };

        if (isCaller) {
          // CALLER LOGIC
          const offerDescription = await pc.createOffer();
          await pc.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };
          await set(ref(db, `calls/${chatId}/offer`), offer);

          // Listen for answer
          let isAnswerSet = false;
          const ansUnsub = onValue(ref(db, `calls/${chatId}/answer`), async (snap) => {
            const data = snap.val();
            if (data && !isAnswerSet && pc.signalingState === 'have-local-offer') {
              isAnswerSet = true;
              try {
                  const answerDescription = new RTCSessionDescription(data);
                  await pc.setRemoteDescription(answerDescription);
                  
                  remoteIceQueue.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.error(e)));
                  remoteIceQueue.length = 0;
              } catch (e) {
                  isAnswerSet = false;
                  console.error(e); 
              }
            }
          });
          unsubcribeRefs.current.push(ansUnsub);

          // Granular network candidate collection
          bindIceListener(answerCandidatesRef);

        } else {
          // RECEIVER LOGIC
          // Wait for offer, then answer
          let isOfferSet = false;
          const offerUnsub = onValue(ref(db, `calls/${chatId}/offer`), async (snap) => {
            const offerData = snap.val();
            if (offerData && !isOfferSet && pc.signalingState === 'stable') {
              isOfferSet = true;
              try {
                  await pc.setRemoteDescription(new RTCSessionDescription(offerData));
                  
                  remoteIceQueue.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.error(e)));
                  remoteIceQueue.length = 0;

                  const answerDescription = await pc.createAnswer();
                  await pc.setLocalDescription(answerDescription);
                  
                  const answer = { type: answerDescription.type, sdp: answerDescription.sdp };
                  await set(ref(db, `calls/${chatId}/answer`), answer);
              } catch(e) { 
                  isOfferSet = false;
                  console.error(e); 
              }
            }
          });
          unsubcribeRefs.current.push(offerUnsub);

          bindIceListener(offerCandidatesRef);
        }
        
        // Listen for call ending
        const statusUnsub = onValue(ref(db, `calls/${chatId}/status`), (snap) => {
            if (snap.val() === 'ended') {
                cleanup();
                onEnd();
            }
        });
        unsubcribeRefs.current.push(statusUnsub);

      } catch (err: any) {
        console.error("WebRTC Error:", err);
        toneGenerator.stop();
        setCallStatus(`Error: Camera/Microphone Permission Denied`);
        // Don't auto-hang up so they can read the error message
      }
    };

    setupCall();

    return () => cleanup();
  }, [chatId, isCaller, type]);

  const cleanup = () => {
    toneGenerator.stop();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (pcRef.current) pcRef.current.close();
    unsubcribeRefs.current.forEach(u => u());
    if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
    }
  };

  const handleHangup = async () => {
    toneGenerator.stop();
    await set(ref(db, `calls/${chatId}/status`), 'ended');
    await remove(ref(db, `users/${otherUserId}/incomingCall`)); // clean up DB signals
    await remove(ref(db, `calls/${chatId}`)); // clean up DB signals
    cleanup();
    onEnd();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <Dialog open={true} fullScreen PaperProps={{ sx: { bgcolor: '#111' } }}>
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.7), transparent)', zIndex: 10 }}>
            <Typography variant="h5" color="white" fontWeight="bold">{otherUserName}</Typography>
            <Typography variant="subtitle1" color="rgba(255,255,255,0.7)">{callStatus}</Typography>
        </Box>

        <Typography variant="caption" sx={{ position: 'absolute', top: 80, left: 24, bgcolor: 'rgba(0,0,0,0.7)', p: 1, borderRadius: 1, color: 'white', zIndex: 9999 }}>
            Diagnostic — Audio Tracks: {remoteStream?.getAudioTracks().length || 0} | Play Blocked: {playBlocked ? 'YES' : 'NO'}
        </Typography>

        <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover', 
                    position: 'absolute',
                    opacity: type === 'video' ? 1 : 0, 
                    pointerEvents: type === 'video' ? 'auto' : 'none'
                }} 
            />
            {/* Extremely critical! Floating Audio must be physically mounted in the DOM on Mobile to gain hardware sink access! */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {type === 'voice' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, zIndex: 1 }}>
                    <Avatar sx={{ width: 120, height: 120, bgcolor: 'primary.main' }}><Phone sx={{ fontSize: 60 }}/></Avatar>
                    <Typography color="white" variant="h6">Voice Call</Typography>
                </Box>
            )}

            {playBlocked && (
                <Button variant="contained" color="warning" size="large" onClick={forcePlay} sx={{ position: 'absolute', zIndex: 9999 }}>
                    Tap to Enable Audio
                </Button>
            )}

            {/* Local Video Thumbnail */}
            {type === 'video' && !isVideoOff && (
              <Box sx={{ position: 'absolute', bottom: 20, right: 20, width: 150, height: 220, borderRadius: 3, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.2)' }}>
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
                />
              </Box>
            )}
        </Box>

        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', gap: 4, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', zIndex: 10 }}>
            <IconButton onClick={toggleMute} sx={{ bgcolor: isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
               {isMuted ? <MicOff /> : <Mic />}
            </IconButton>
            
            {type === 'video' && (
              <IconButton onClick={toggleVideo} sx={{ bgcolor: isVideoOff ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
                 {isVideoOff ? <VideocamOff /> : <Videocam />}
              </IconButton>
            )}

            <IconButton onClick={handleHangup} sx={{ bgcolor: 'error.main', color: 'white', '&:hover': { bgcolor: 'error.dark' }, width: 56, height: 56 }}>
               <CallEnd />
            </IconButton>
        </Box>
    </Dialog>
  );
}
