import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom';
import { initDatabase } from './database/init';
import { ENCODER_BUFFER_SIZE } from './config/encoder';
import { metricsCollector } from './monitoring/MetricsCollector';


const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7001;

console.log(`Colyseus encoder buffer size: ${Math.round(ENCODER_BUFFER_SIZE / 1024)} KB`);

// Initialize database
console.log('Initializing database...');
export const db = initDatabase('./game.db');

// Create Express app for monitor
const app = express();
app.use('/monitor', monitor());

// Create HTTP server from Express
const httpServer = createServer(app);

// Create WebSocket transport attached to HTTP server
const transport = new WebSocketTransport({
  server: httpServer,
  pingInterval: 6000,
  pingMaxRetries: 3
});

// Create Colyseus server
const gameServer = new Server({ transport });

// Register single game room
gameServer.define('firegroup', GameRoom);

// Start server
httpServer.on('error', (error: Error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`🎮 BlockGame server running on 0.0.0.0:${PORT}`);
  console.log(`WebSocket endpoint: wss://ws-game.firegroup.vn`);
  console.log(`📊 Monitor panel: http://ws-game.firegroup.vn/monitor`);

  // Precreate firegroup room with fixed ID
  try {
    const firegroupRoom = await matchMaker.createRoom('firegroup', { roomId: 'firegroup' });
    console.log(`✅ Firegroup room created: ${firegroupRoom.roomId}`);
  } catch (error) {
    console.error('Failed to create room:', error);
  }

  // Start PM2 metrics collection (5s interval)
  metricsCollector.start();
  console.log('📊 PM2 metrics collector started');
});

// Handle graceful shutdown
let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\nShutting down server...');
  metricsCollector.stop();

  gameServer.gracefullyShutdown().then(() => {
    console.log('Closing database...');
    db.close();
    console.log('Server shutdown complete');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
