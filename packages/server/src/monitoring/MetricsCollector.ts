/**
 * Global Metrics Collector
 * Aggregates metrics from all game rooms for PM2 monitoring
 */

import type { GameRoom } from '../rooms/GameRoom';
import { pm2Metrics, type GameMetrics } from './PM2Metrics';

class GlobalMetricsCollector {
  private rooms: Map<string, GameRoom> = new Map();
  private updateInterval: Timer | null = null;

  /**
   * Start metrics collection (call after server starts)
   */
  start(): void {
    if (this.updateInterval) return;

    // Send metrics to PM2 every 5 seconds
    this.updateInterval = setInterval(() => {
      this.collectAndSend();
    }, 5000);

    console.log('[METRICS] Global metrics collector started (5s interval)');
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Register a game room for metrics collection
   */
  registerRoom(room: GameRoom): void {
    this.rooms.set(room.roomId, room);
    console.log(`[METRICS] Registered room: ${room.roomId} (${this.rooms.size} total)`);
  }

  /**
   * Unregister a game room
   */
  unregisterRoom(roomId: string): void {
    this.rooms.delete(roomId);
    console.log(`[METRICS] Unregistered room: ${roomId} (${this.rooms.size} remaining)`);
  }

  /**
   * Collect metrics from all rooms and send to PM2
   */
  private collectAndSend(): void {
    const metrics = this.aggregateMetrics();

    // Send to PM2 (if running under PM2)
    pm2Metrics.send(metrics);

    // Also log to console (captured by PM2 logs)
    pm2Metrics.log(metrics);
  }

  /**
   * Aggregate metrics from all rooms
   */
  private aggregateMetrics(): GameMetrics {
    let totalPlayers = 0;
    let totalActiveTiles = 0;
    let totalPoolSize = 0;
    let totalPhysicsTime = 0;
    let totalFrameTime = 0;
    let roomCount = 0;

    for (const room of this.rooms.values()) {
      totalPlayers += room.state.players.size;
      totalActiveTiles += room.getActiveTileCount();
      totalPoolSize += room.getPoolSize();
      totalPhysicsTime += room.getAvgPhysicsTime();
      totalFrameTime += room.getAvgFrameTime();
      roomCount++;
    }

    const avgPhysicsTime = roomCount > 0 ? totalPhysicsTime / roomCount : 0;
    const avgFrameTime = roomCount > 0 ? totalFrameTime / roomCount : 0;
    const serverFPS = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;

    return {
      activeRooms: this.rooms.size,
      totalPlayers,
      activeTiles: totalActiveTiles,
      poolSize: totalPoolSize,
      avgPhysicsTime,
      avgFrameTime,
      serverFPS,
    };
  }
}

export const metricsCollector = new GlobalMetricsCollector();
