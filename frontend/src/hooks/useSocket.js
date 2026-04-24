import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let sharedSocket = null;
let refCount = 0;

/**
 * Singleton Socket.io hook — shares one connection across all components.
 * Authenticates via JWT token from localStorage.
 * Auto-joins rooms server-side based on user role.
 * Handles reconnection with request_sync.
 */
export default function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('reviewsense_token');

    if (!sharedSocket || sharedSocket.disconnected) {
      sharedSocket = io(SOCKET_URL, {
        auth: { token },
        query: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });

      sharedSocket.on('connect', () => {
        console.log('[useSocket] connected', sharedSocket.id);
        // Request state sync on reconnect
        sharedSocket.emit('request_sync');
      });

      sharedSocket.on('disconnect', (reason) => {
        console.log('[useSocket] disconnected', reason);
      });
    }

    socketRef.current = sharedSocket;
    refCount += 1;

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    sharedSocket.on('connect', handleConnect);
    sharedSocket.on('disconnect', handleDisconnect);
    if (sharedSocket.connected) setConnected(true);

    return () => {
      sharedSocket.off('connect', handleConnect);
      sharedSocket.off('disconnect', handleDisconnect);
      refCount -= 1;
      if (refCount <= 0 && sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
        refCount = 0;
      }
    };
  }, []);

  return {
    socket: socketRef.current || sharedSocket,
    connected,
  };
}
