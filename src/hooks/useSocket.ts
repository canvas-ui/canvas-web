import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_ROUTES } from '@/config/api';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socketInstance = io(API_ROUTES.ws, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('WebSocket connected');
    });

    socketInstance.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    socketInstance.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.close();
    };
  }, []);

  return socket;
}
