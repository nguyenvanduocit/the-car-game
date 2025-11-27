import { Client, Room } from 'colyseus.js';

/**
 * Network statistics for performance monitoring
 */
export interface NetworkStats {
  latency: number;        // RTT in ms
  bytesSent: number;      // Estimated bytes sent
  bytesReceived: number;  // Estimated bytes received
  messagesSent: number;   // Total messages sent
  messagesReceived: number; // Total messages received
}

// Storage key for persistent player token (prevents duplicate tabs)
const PLAYER_TOKEN_KEY = 'blockgame_player_token';

/**
 * Colyseus client connection manager
 * Uses 'any' type for room state since Colyseus client-side schemas are dynamic
 */
export class ColyseusClient {
  private client: Client;
  private room: Room<any> | null = null;
  private connected: boolean = false;
  private playerToken: string;

  // Network stats tracking
  private latency: number = 0;
  private bytesSent: number = 0;
  private bytesReceived: number = 0;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingTime: number = 0;

  constructor(serverUrl: string = 'ws://localhost:7001') {
    this.client = new Client(serverUrl);

    // Generate or retrieve persistent player token (prevents duplicate tabs)
    this.playerToken = localStorage.getItem(PLAYER_TOKEN_KEY) ?? crypto.randomUUID();
    localStorage.setItem(PLAYER_TOKEN_KEY, this.playerToken);
  }

  /**
   * Join game room with player name
   */
  async joinRoom(displayName: string): Promise<Room<any>> {
    try {
      console.log('Connecting to firegroup room...');

      this.room = await this.client.joinOrCreate<any>('firegroup', {
        displayName,
        playerToken: this.playerToken,
      });

      this.connected = true;
      console.log('Connected to room:', this.room.roomId);

      // Wait for initial state to be synchronized before setting up listeners
      await this.waitForState();

      // Setup state change listeners
      this.setupListeners();

      return this.room;
    } catch (error) {
      console.error('Failed to join room:', error);
      throw error;
    }
  }

  /**
   * Wait for initial state to be synchronized from server
   */
  private waitForState(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.room) {
        resolve();
        return;
      }

      // If state is already available, resolve immediately
      if (this.room.state && this.room.state.players) {
        console.log('State already synchronized');
        resolve();
        return;
      }

      // Otherwise, wait for first state change
      const onStateChange = () => {
        if (this.room && this.room.state && this.room.state.players) {
          console.log('State synchronized');
          this.room.onStateChange.remove(onStateChange);
          resolve();
        }
      };

      this.room.onStateChange(onStateChange);
    });
  }

  /**
   * Setup Colyseus state listeners
   */
  private setupListeners(): void {
    if (!this.room) return;

    // State change logging (tracks all changes including player join/leave)
    this.room.onStateChange((state) => {
      // State updates are being tracked silently
    });

    // Room messages
    this.room.onMessage('joined', (message) => {
      console.log('Welcome message:', message);
    });

    this.room.onMessage('show_puzzle', (message) => {
      console.log('Show puzzle:', message);
    });

    this.room.onMessage('puzzle_success', (message) => {
      console.log('Puzzle solved:', message);
    });

    this.room.onMessage('puzzle_failed', (message) => {
      console.log('Puzzle failed:', message);
    });

    this.room.onMessage('tile_placed', (message) => {
      console.log('Tile placed:', message);
    });

    this.room.onMessage('placement_failed', (message) => {
      console.log('Placement failed:', message);
    });

    this.room.onMessage('game_complete', (message) => {
      console.log('Game complete!', message);
      this.trackIncoming(50);
    });

    // Pong response for latency measurement
    this.room.onMessage('pong', (message: { timestamp: number }) => {
      this.latency = Date.now() - message.timestamp;
      this.trackIncoming(20);
    });

    // Start ping interval (every 2 seconds)
    this.startPingInterval();

    // Error handling
    this.room.onError((code, message) => {
      console.error('Room error:', code, message);
    });

    // Leave handling
    this.room.onLeave((code) => {
      console.log('Left room with code:', code);
      this.connected = false;
      this.stopPingInterval();

      // Handle duplicate session disconnect (new tab opened)
      if (code === 4001) {
        alert('Game opened in another tab. This session has been disconnected.');
      }
    });
  }

  /**
   * Start ping interval for latency measurement
   */
  private startPingInterval(): void {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (this.room && this.connected) {
        this.room.send('ping', { timestamp: Date.now() });
        this.trackOutgoing(20);
      }
    }, 2000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Track outgoing bytes (estimated)
   */
  private trackOutgoing(bytes: number): void {
    this.bytesSent += bytes;
    this.messagesSent++;
  }

  /**
   * Track incoming bytes (estimated)
   */
  private trackIncoming(bytes: number): void {
    this.bytesReceived += bytes;
    this.messagesReceived++;
  }

  /**
   * Get current network statistics
   */
  getNetworkStats(): NetworkStats {
    return {
      latency: this.latency,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
    };
  }

  /**
   * Send player movement input to server (SERVER-AUTHORITATIVE)
   * Client sends direction (normalized), server calculates velocity
   */
  sendMovement(direction: { x: number; y: number; z: number }, rotation: number): void {
    if (!this.room || !this.connected) return;

    this.room.send('player_move', {
      direction,
      rotation,
    });
    this.trackOutgoing(40); // direction (3 floats) + rotation (1 float) + overhead
  }

  /**
   * Send tile click to server
   */
  sendTileClick(tileIndex: number): void {
    if (!this.room || !this.connected) return;

    this.room.send('tile_click', {
      tileIndex,
      timestamp: Date.now(),
    });
    this.trackOutgoing(20);
  }

  /**
   * Send puzzle result to server
   * Server validates answerIndex using QuestionBank
   */
  sendPuzzleResult(tileIndex: number, success: boolean, answerIndex: number): void {
    if (!this.room || !this.connected) return;

    this.room.send('puzzle_submit', {
      tileIndex,
      success,
      answerIndex,
    });
    this.trackOutgoing(20);
  }

  /**
   * Send puzzle cancel to server (user closed dialog)
   * Server will release tile ownership
   */
  sendPuzzleCancel(tileIndex: number): void {
    if (!this.room || !this.connected) return;

    this.room.send('puzzle_cancel', { tileIndex });
    this.trackOutgoing(15);
  }

  /**
   * Send frame placement to server
   * Server will validate player is holding a tile
   */
  sendFramePlacement(slotIndex: number): void {
    if (!this.room || !this.connected) return;

    this.room.send('frame_place', {
      slotIndex,
      timestamp: Date.now(),
    });
    this.trackOutgoing(20);
  }

  /**
   * Start charging tile for shooting (right mouse down)
   * Server will grab tile with arms and track charge time
   * @param tileIndex The tile to charge (0-399)
   */
  sendStartTileCharge(tileIndex: number): void {
    if (!this.room || !this.connected) return;

    this.room.send('start_tile_charge', {
      tileIndex,
      timestamp: Date.now(),
    });
    this.trackOutgoing(20);
  }

  /**
   * Shoot charged tile (right mouse up)
   * Server calculates strength and applies impulse
   * @param tileIndex The tile to shoot (0-399)
   * @param direction The direction to shoot
   */
  sendTileShoot(tileIndex: number, direction: { x: number; y: number; z: number }): void {
    if (!this.room || !this.connected) return;

    this.room.send('tile_shoot', {
      tileIndex,
      direction,
      timestamp: Date.now(),
    });
    this.trackOutgoing(35);
  }

  /**
   * Send fork attack (melee attack on another player)
   * @param targetSessionId The session ID of the player being attacked
   */
  sendForkAttack(targetSessionId: string): void {
    if (!this.room || !this.connected) return;

    this.room.send('fork_attack', {
      targetSessionId,
      timestamp: Date.now(),
    });
    this.trackOutgoing(30);
  }

  /**
   * Send respawn request (player manually requests respawn)
   */
  sendRespawn(): void {
    if (!this.room || !this.connected) return;

    this.room.send('respawn', {});
    this.trackOutgoing(10);
  }

  /**
   * Get current room
   */
  getRoom(): Room<any> | null {
    return this.room;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Leave room
   */
  async leave(): Promise<void> {
    if (this.room) {
      await this.room.leave();
      this.room = null;
      this.connected = false;
    }
  }

}
