/**
 * PM2 Metrics Integration
 * Sends custom metrics to PM2 for monitoring via pm2 monit
 */

import io from '@pm2/io';

export interface GameMetrics {
  activeRooms: number;
  totalPlayers: number;
  activeTiles: number;
  poolSize: number;
  avgPhysicsTime: number;
  avgFrameTime: number;
  serverFPS: number;
}

class PM2MetricsCollector {
  private enabled: boolean = false;
  private metrics: {
    activeRooms: any;
    totalPlayers: any;
    activeTiles: any;
    poolSize: any;
    avgPhysicsTime: any;
    avgFrameTime: any;
    serverFPS: any;
  } | null = null;

  constructor() {
    // Check if running under PM2
    const hasProcessSend = !!process.send;
    const hasPM2Home = process.env.PM2_HOME !== undefined;

    if (!hasProcessSend || !hasPM2Home) {
      return;
    }

    try {
      // Initialize PM2 I/O
      io.init({
        metrics: {
          network: false, // Disable default network metrics
          http: false,    // Disable default HTTP metrics
        },
      });

      // Create custom metrics
      this.metrics = {
        activeRooms: io.metric({
          name: 'Active Rooms',
          unit: 'rooms',
        }),
        totalPlayers: io.metric({
          name: 'Total Players',
          unit: 'players',
        }),
        activeTiles: io.metric({
          name: 'Active Tiles',
          unit: 'tiles',
        }),
        poolSize: io.metric({
          name: 'Pool Size',
          unit: 'tiles',
        }),
        avgPhysicsTime: io.metric({
          name: 'Avg Physics Time',
          unit: 'ms',
        }),
        avgFrameTime: io.metric({
          name: 'Avg Frame Time',
          unit: 'ms',
        }),
        serverFPS: io.metric({
          name: 'Server FPS',
          unit: 'fps',
        }),
      };

      this.enabled = true;
      console.log('[PM2] Custom metrics initialized successfully');
    } catch (error) {
      console.error('[PM2] Failed to initialize custom metrics:', error);
      this.enabled = false;
    }
  }

  /**
   * Send metrics to PM2
   */
  send(metrics: GameMetrics): void {
    if (!this.enabled || !this.metrics) return;

    try {
      this.metrics.activeRooms.set(metrics.activeRooms);
      this.metrics.totalPlayers.set(metrics.totalPlayers);
      this.metrics.activeTiles.set(metrics.activeTiles);
      this.metrics.poolSize.set(metrics.poolSize);
      this.metrics.avgPhysicsTime.set(parseFloat(metrics.avgPhysicsTime.toFixed(2)));
      this.metrics.avgFrameTime.set(parseFloat(metrics.avgFrameTime.toFixed(2)));
      this.metrics.serverFPS.set(parseFloat(metrics.serverFPS.toFixed(1)));
    } catch (error) {
      console.error('[PM2] Failed to update metrics:', error);
    }
  }

  /**
   * Log metrics to console (deprecated - metrics are sent to PM2 instead)
   */
  log(metrics: GameMetrics): void {
    // Metrics are sent to PM2 via @pm2/io, no need to log to console
  }

  /**
   * Check if running under PM2
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

export const pm2Metrics = new PM2MetricsCollector();
