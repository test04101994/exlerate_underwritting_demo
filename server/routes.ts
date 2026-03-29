/**
 * HTTP API routes live in Python (`api/`). This module only creates the HTTP server
 * and Socket.IO for any legacy real-time use.
 */
import type { Express } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

export async function registerRoutes(app: Express) {
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Client ${socket.id} connected`);
    socket.on('disconnect', () => {
      console.log(`Client ${socket.id} disconnected`);
    });
  });

  return server;
}
