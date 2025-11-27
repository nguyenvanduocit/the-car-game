import { Client, Room } from 'colyseus.js';

interface BotState {
  currentRotation: number;
  targetRotation: number;
  moveDirection: { x: number; z: number };
  nextDirectionChangeTime: number;
}

/**
 * BotClient - Simulates a real player connecting to the game
 * Connects via Colyseus client just like a browser would
 */
export class BotClient {
  private client: Client;
  private room: Room | null = null;
  private name: string;
  private state: BotState;
  private updateInterval: NodeJS.Timeout | null = null;
  private connected: boolean = false;

  constructor(serverUrl: string, name: string) {
    this.client = new Client(serverUrl);
    this.name = name;

    // Initialize bot AI state
    const initialRotation = Math.random() * Math.PI * 2;
    this.state = {
      currentRotation: initialRotation,
      targetRotation: initialRotation,
      moveDirection: { x: 0, z: 0 },
      nextDirectionChangeTime: Date.now() + Math.random() * 2000 + 1000,
    };
  }

  /**
   * Connect to game room
   */
  async connect(roomName: string = 'firegroup'): Promise<void> {
    try {
      console.log(`[BOT ${this.name}] Connecting to room "${roomName}"...`);

      this.room = await this.client.joinOrCreate(roomName, {
        displayName: this.name,
      });

      this.connected = true;
      console.log(`[BOT ${this.name}] Connected! SessionId: ${this.room.sessionId}`);

      // Setup message handlers
      this.setupMessageHandlers();

      // Start AI behavior loop
      this.startBehaviorLoop();
    } catch (error) {
      console.error(`[BOT ${this.name}] Failed to connect:`, error);
      throw error;
    }
  }

  /**
   * Setup message handlers for server communication
   */
  private setupMessageHandlers(): void {
    if (!this.room) return;

    this.room.onMessage('joined', (data) => {
      console.log(`[BOT ${this.name}] Received joined confirmation`);
    });

    this.room.onMessage('show_puzzle', (data) => {
      console.log(`[BOT ${this.name}] Received puzzle for tile ${data.tileId}`);
      // Auto-solve puzzle after short delay (simulate thinking)
      setTimeout(() => {
        this.solvePuzzle(data.tileId);
      }, 1000 + Math.random() * 2000); // 1-3 seconds
    });

    this.room.onMessage('puzzle_success', (data) => {
      console.log(`[BOT ${this.name}] Puzzle solved! Tile ${data.tileId} placed in slot ${data.slotIndex}`);
    });

    this.room.onMessage('puzzle_failed', (data) => {
      console.log(`[BOT ${this.name}] Puzzle failed for tile ${data.tileId}`);
    });

    this.room.onMessage('tile_placed', (data) => {
      // Just acknowledge - don't log to avoid spam
    });

    this.room.onMessage('game_complete', (data) => {
      console.log(`[BOT ${this.name}] 🎉 Game completed!`);
    });

    this.room.onError((code, message) => {
      console.error(`[BOT ${this.name}] Error ${code}:`, message);
    });

    this.room.onLeave((code) => {
      console.log(`[BOT ${this.name}] Left room with code ${code}`);
      this.connected = false;
    });
  }

  /**
   * Start behavior loop - handles movement and actions
   */
  private startBehaviorLoop(): void {
    // Update at 60Hz (same as physics)
    this.updateInterval = setInterval(() => {
      this.updateBehavior();
    }, 1000 / 60); // 16.67ms
  }

  /**
   * Update bot behavior - called at 60Hz
   */
  private updateBehavior(): void {
    if (!this.room || !this.connected) return;

    const now = Date.now();

    // Check if time to change direction
    if (now >= this.state.nextDirectionChangeTime) {
      const moveType = Math.random();

      if (moveType < 0.2) {
        // 20% chance: Stop moving
        this.state.moveDirection = { x: 0, z: 0 };
      } else {
        // 80% chance: Move in random direction
        const moveAngle = Math.random() * Math.PI * 2;
        this.state.moveDirection = {
          x: Math.cos(moveAngle),
          z: Math.sin(moveAngle),
        };
        this.state.targetRotation = moveAngle;
      }

      // Schedule next direction change (2-5 seconds)
      this.state.nextDirectionChangeTime = now + Math.random() * 3000 + 2000;
    }

    // Smooth rotation interpolation
    const rotationSpeed = 0.1;
    let rotationDiff = this.state.targetRotation - this.state.currentRotation;

    // Normalize angle difference to [-PI, PI]
    while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
    while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

    this.state.currentRotation += rotationDiff * rotationSpeed;

    // Normalize current rotation to [0, 2*PI]
    while (this.state.currentRotation < 0) this.state.currentRotation += Math.PI * 2;
    while (this.state.currentRotation >= Math.PI * 2) this.state.currentRotation -= Math.PI * 2;

    // Send movement to server
    this.room.send('player_move', {
      direction: {
        x: this.state.moveDirection.x,
        y: 0,
        z: this.state.moveDirection.z,
      },
      rotation: this.state.currentRotation,
    });
  }

  /**
   * Solve puzzle (auto-solve for bots)
   */
  private solvePuzzle(tileId: string): void {
    if (!this.room) return;

    console.log(`[BOT ${this.name}] Solving puzzle for tile ${tileId}`);

    // Always succeed for bots (they're good at puzzles!)
    this.room.send('puzzle_submit', {
      tileId,
      success: true,
    });
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    console.log(`[BOT ${this.name}] Disconnecting...`);

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.room) {
      await this.room.leave();
      this.room = null;
    }

    this.connected = false;
  }

  /**
   * Check if bot is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
