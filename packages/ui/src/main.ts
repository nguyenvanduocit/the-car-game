import { Vector3, Quaternion, KeyboardEventTypes } from '@babylonjs/core';
import { GameScene } from './game/Scene';
import { ColyseusClient } from './network/ColyseusClient';
import { NameInputGUI } from './gui/NameInputGUI';
import { EscMenuGUI } from './gui/EscMenuGUI';
import { HelpGUI } from './gui/HelpGUI';
import { DisconnectGUI } from './gui/DisconnectGUI';
import { StateSync } from './network/StateSync';
import { PlayerInput } from './game/PlayerInput';
import { LeaderboardWall } from './game/LeaderboardWall';
import { Frame } from './game/Frame';
import { Raycast } from './game/Raycast';
import { MultipleChoiceGUI } from './puzzles/MultipleChoiceGUI';
import { DeathCountdownGUI } from './gui/DeathCountdownGUI';
import { getStateCallbacks } from 'colyseus.js';
import { QuestionBank, getFrameSlotPosition, TILE_CONFIG } from '@blockgame/shared';

/**
 * Get server URL based on environment
 * Priority:
 * 1. VITE_SERVER_URL environment variable (if set)
 * 2. Development: ws://localhost:7001
 * 3. Production: wss://ws-game.firegroup.vn
 */
function getServerUrl(): string {
  // Allow manual override via environment variable
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }

  // Auto-detect based on build mode
  if (import.meta.env.DEV) {
    return 'ws://localhost:7001';
  }
  return 'wss://ws-game.firegroup.vn';
}

/**
 * Main entry point for BlockGame client
 * Phase 3: Player joins game room with name input GUI
 * Phase 4: Player movement with WASD controls
 * Phase 6: Picture frame assembly and game completion
 * Phase 8: Leaderboard display
 */
class BlockGame {
  private scene: GameScene | null = null;
  private client: ColyseusClient | null = null;
  private nameInputGUI: NameInputGUI | null = null;
  private escMenuGUI: EscMenuGUI | null = null;
  private helpGUI: HelpGUI | null = null;
  private stateSync: StateSync | null = null;
  private playerInput: PlayerInput | null = null;
  private leaderboardWall: LeaderboardWall | null = null;
  private frame: Frame | null = null;
  private raycast: Raycast | null = null;
  private room: any = null;
  private currentPuzzle: MultipleChoiceGUI | null = null;
  private deathCountdownGUI: DeathCountdownGUI | null = null;
  private disconnectGUI: DisconnectGUI | null = null;

  async init() {
    console.log('🎮 BlockGame Client Starting...');

    // Initialize QuestionBank
    QuestionBank.initialize();
    console.log('✅ QuestionBank initialized');

    // Get canvas element
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!canvas) {
      console.error('Canvas element not found!');
      return;
    }

    // Initialize BabylonJS scene
    console.log('Initializing BabylonJS scene...');
    this.scene = new GameScene(canvas);

    // Initialize physics (MUST be done before connecting to server)
    console.log('Initializing Havok physics...');
    await this.scene.initializePhysics();
    console.log('✅ Physics initialized');

    // Note: Sound system will be initialized on first user interaction (Connect button)
    // to comply with browser autoplay policies

    // Initialize Colyseus client
    const serverUrl = getServerUrl();
    console.log('Initializing Colyseus client with server:', serverUrl);
    this.client = new ColyseusClient(serverUrl);

    // Show name input GUI (user must always enter name to join)
    this.nameInputGUI = new NameInputGUI(this.scene.getScene());
    this.nameInputGUI.onConnect((playerName) => {
      this.handleConnect(playerName);
    });
  }

  /**
   * Handle player connect with name
   */
  private async handleConnect(playerName: string): Promise<void> {
    if (!this.client || !this.scene) {
      return;
    }

    // Initialize sound system NOW (user just clicked Connect button = user gesture)
    if (this.nameInputGUI?.isSoundEnabled()) {
      console.log('Initializing sound system after user interaction...');
      try {
        await this.scene.initializeSound();
        console.log('✅ Sound system initialized');
      } catch (error) {
        console.warn('⚠️ Failed to initialize sound system:', error);
        // Continue without sound
      }
    } else {
      console.log('🔇 Sound disabled by user');
    }

    console.log(`Connecting as ${playerName} to firegroup room...`);

    try {
      // Attempt to join room
      this.room = await this.client.joinRoom(playerName);
      console.log('✅ Connected to game room!', this.room.roomId);
      console.log('Session ID:', this.room.sessionId);

      // Setup game after connection
      await this.setupGameAfterConnect();

    } catch (error) {
      console.error('❌ Failed to connect to server:', error);

      // Show error in GUI (if it exists)
      if (this.nameInputGUI) {
        if (error instanceof Error) {
          this.nameInputGUI.showError(`Connection failed: ${error.message}`);
        } else {
          this.nameInputGUI.showError('Failed to connect to server. Make sure the server is running.');
        }
      }
    }
  }

  /**
   * Setup game after successful room connection
   */
  private async setupGameAfterConnect(): Promise<void> {
    if (!this.client || !this.scene || !this.room) {
      return;
    }

    // Hide name input GUI (if it exists)
    if (this.nameInputGUI) {
      this.nameInputGUI.hide();
    }

    // Capture cursor for FPS controls
    const canvas = this.scene.getScene().getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.requestPointerLock();
      console.log('✅ Pointer lock requested for FPS controls');
    }

    // Initialize state sync manager (with physics for tile rendering)
    this.stateSync = new StateSync(
      this.scene.getScene(),
      this.room,
      this.scene.getPhysics()
    );

    // Setup shadow generator for dynamic objects
    const shadowGenerator = this.scene.getShadowGenerator();
    if (shadowGenerator) {
      this.stateSync.setShadowGenerator(shadowGenerator);
      console.log('✅ Shadow generator configured for dynamic objects');
    }

    // Setup glow layer for visual effects (client-side only)
    const glowLayer = this.scene.getGlowLayer();
    if (glowLayer) {
      this.stateSync.setGlowLayer(glowLayer);
      console.log('✅ Glow layer configured for player visual effects');
    }

    // Set game camera for reconciliation
    this.stateSync.setGameCamera(this.scene.getCamera());

    // Set sound system for audio feedback
    this.stateSync.setSound(this.scene.getSound());

    // Set scoreboard for goal score updates
    this.stateSync.setScoreboard(this.scene.getScoreboard());

    // Initialize death countdown GUI (client-side only, no server sync)
    this.deathCountdownGUI = new DeathCountdownGUI(this.scene.getScene());
    this.stateSync.setDeathCountdownGUI(this.deathCountdownGUI);
    console.log('✅ Death countdown GUI initialized');

    console.log('✅ State sync initialized with physics');

    // Connect network stats to performance monitor
    this.scene.getPerformanceMonitor().setNetworkStatsProvider(() => this.client!.getNetworkStats());
    console.log('✅ Network stats connected to performance monitor');

    // Get own player's spawn position from server
    const myPlayer = this.room.state.players.get(this.room.sessionId);
    if (myPlayer) {
      // Update camera to follow player position (will fall with player)
      this.scene.getCamera().setPosition(
        myPlayer.position.x,
        myPlayer.position.y,
        myPlayer.position.z
      );
      console.log('Spawned at position:', myPlayer.position);
    }

    // Initialize player input (SERVER-AUTHORITATIVE)
    // Client only sends direction, server handles all physics
    this.playerInput = new PlayerInput(
      this.scene.getScene(),
      this.scene.getCamera(),
      this.client
    );

    // Enable client-side prediction for instant input response
    this.playerInput.setStateSync(this.stateSync);

    console.log('✅ Player input enabled (server-authoritative + client prediction)');

    // Initialize picture frame (Phase 6)
    const tileCount = this.room.state.frameSlots.length;
    this.frame = new Frame(this.scene.getScene(), tileCount);

    // Shadow casting disabled for performance (only player casts shadows)

    // Enable subtle glowing effect on frame border
    if (glowLayer) {
      this.frame.enableGlow(glowLayer);
    }

    // Set frame for slot fill state updates (two-phase tile system)
    this.stateSync.setFrame(this.frame);

    console.log(`✅ Picture frame initialized with ${tileCount} slots`);

    // Initialize raycast for tile and frame slot clicking
    this.raycast = new Raycast(
      this.scene.getScene(),
      this.scene.getCamera(),
      this.client
    );
    this.raycast.setFrame(this.frame);
    this.raycast.setStateSync(this.stateSync);
    this.raycast.setSound(this.scene.getSound());
    this.stateSync.setRaycast(this.raycast);
    console.log('✅ Raycast initialized for tile and frame slot detection');

    // Initialize ESC menu and Help GUI
    this.escMenuGUI = new EscMenuGUI(this.scene.getScene());
    this.helpGUI = new HelpGUI(this.scene.getScene());
    this.setupEscMenu();
    console.log('✅ ESC menu and Help GUI initialized');

    // Initialize disconnect GUI
    this.disconnectGUI = new DisconnectGUI(this.scene.getScene());
    this.setupDisconnectHandler();
    console.log('✅ Disconnect GUI initialized');

    // Initialize leaderboard wall in game world (shows all-time rankings)
    this.leaderboardWall = new LeaderboardWall(this.scene.getScene());

    // Initial leaderboard update
    this.updateAllTimeLeaderboard();

    // Listen for all-time leaderboard changes using Colyseus 0.15+ API
    const $ = getStateCallbacks(this.room);
    $(this.room.state.allTimeLeaderboard).onAdd(() => this.updateAllTimeLeaderboard());
    $(this.room.state.allTimeLeaderboard).onRemove(() => this.updateAllTimeLeaderboard());

    console.log('✅ Leaderboard wall initialized');

    // Listen for puzzle_success message (local player only - play success sound)
    this.room.onMessage('puzzle_success', (message: { tileIndex: number; slotIndex: number }) => {
      console.log('[PUZZLE] Puzzle success received:', message);

      // Play puzzle success sound (only local player receives this)
      if (this.scene) {
        this.scene.getSound().play('puzzleSuccess');
      }
    });

    // Listen for tile_placed message (broadcast to ALL clients - triggers fly animation)
    this.room.onMessage('tile_placed', (message: {
      tileIndex: number; // frameSlotIndex
      slotIndex: number;
      sessionId: string;
    }) => {
      console.log('[TILE] Tile placed message received:', message);

      const frameSlotIndex = message.tileIndex;

      // Get tile renderer
      const tileRenderer = this.stateSync?.getTile(frameSlotIndex);
      if (!tileRenderer) {
        console.error('[TILE] Tile renderer not found:', frameSlotIndex);
        return;
      }

      // Calculate target position from slot index
      const tileCount = this.room.state.frameSlots.length;
      const targetPosRaw = getFrameSlotPosition(message.slotIndex, tileCount);
      const targetPosition = new Vector3(targetPosRaw.x, targetPosRaw.y, targetPosRaw.z);

      // Calculate target rotation: 90° around X + 90° counter-clockwise around Z
      const angleX = Math.PI / 2;
      const angleZ = Math.PI / 2;
      const qx = new Quaternion(Math.sin(angleX / 2), 0, 0, Math.cos(angleX / 2));
      const qz = new Quaternion(0, 0, Math.sin(angleZ / 2), Math.cos(angleZ / 2));
      const targetRotation = qz.multiply(qx);

      // Start client-side fly animation
      tileRenderer.startFlyAnimation(targetPosition, targetRotation, () => {
        if (this.scene) {
          this.scene.getSound().play('tilePlace');
        }
      });

      console.log(`[TILE] Started fly animation for tile ${frameSlotIndex} to slot ${message.slotIndex}`);
    });

    console.log('✅ Tile placement and fly animation listeners registered');

    // Listen for show_puzzle message to display puzzle UI
    this.room.onMessage('show_puzzle', (message: { tileIndex: number; puzzle: any }) => {
      console.log('[PUZZLE] Show puzzle message received:', message);
      this.showPuzzle(message.tileIndex, message.puzzle);
    });

    console.log('✅ Puzzle UI listener registered');
  }

  /**
   * Update all-time leaderboard display on 3D wall
   */
  private updateAllTimeLeaderboard(): void {
    if (!this.room || !this.leaderboardWall) return;

    const allTimeLeaderboard = Array.from(this.room.state.allTimeLeaderboard.values()).map((entry: any) => ({
      rank: entry.rank,
      displayName: entry.displayName,
      tilesPlaced: entry.tilesPlaced,
      gamesPlayed: entry.gamesPlayed,
    }));

    this.leaderboardWall.updateLeaderboard(allTimeLeaderboard);
  }

  /**
   * Show puzzle UI for tile
   */
  private showPuzzle(tileIndex: number, puzzleConfig: any): void {
    if (!this.scene || !this.client) return;

    console.log('[PUZZLE] Showing puzzle for tile:', tileIndex, puzzleConfig);

    // Unlock pointer and disable auto-lock so user can click UI buttons
    document.exitPointerLock();
    if (this.raycast) {
      this.raycast.disablePointerLock();
    }
    console.log('[PUZZLE] Pointer unlocked for UI interaction');

    // Dispose existing puzzle if any
    if (this.currentPuzzle) {
      this.currentPuzzle.dispose();
      this.currentPuzzle = null;
    }

    // Create puzzle UI based on type
    if (puzzleConfig.type === 'multiple_choice') {
      // OPTIMIZED: Use QuestionBank to resolve question from ID
      let puzzleData;

      if (puzzleConfig.questionId) {
        // New optimized path - resolve from QuestionBank
        // Convert questionId from string to number
        const questionIdNum = parseInt(puzzleConfig.questionId, 10);
        const question = QuestionBank.get(questionIdNum);
        if (!question) {
          console.error('[PUZZLE] Question not found:', puzzleConfig.questionId);
          return;
        }
        puzzleData = question;
        console.log('[PUZZLE] Resolved question from QuestionBank:', puzzleConfig.questionId);
      } else {
        // Legacy path - parse from data field
        try {
          puzzleData = typeof puzzleConfig.data === 'string'
            ? JSON.parse(puzzleConfig.data)
            : puzzleConfig.data;
          console.warn('[PUZZLE] Using legacy data field (questionId not found)');
        } catch (error) {
          console.error('[PUZZLE] Failed to parse puzzle data:', error);
          return;
        }
      }

      const advancedTexture = this.scene.getGUITexture();
      this.currentPuzzle = new MultipleChoiceGUI(
        advancedTexture,
        puzzleData.question,
        puzzleData.choices,
        puzzleData.correctIndex
      );

      // Set completion callback
      this.currentPuzzle.setOnComplete((success: boolean, answerIndex: number) => {
        console.log('[PUZZLE] Puzzle completed:', success, 'answerIndex:', answerIndex);
        this.handlePuzzleComplete(tileIndex, success, answerIndex);
      });

      // Set close callback (when user clicks Close button)
      this.currentPuzzle.setOnClose(() => {
        console.log('[PUZZLE] Puzzle closed by user');
        this.handlePuzzleClose(tileIndex);
      });

      this.currentPuzzle.show();
      console.log('[PUZZLE] Multiple choice puzzle displayed');
    } else {
      console.warn('[PUZZLE] Unknown puzzle type:', puzzleConfig.type);
    }
  }

  /**
   * Handle puzzle close (user clicked Close button)
   */
  private handlePuzzleClose(tileIndex: number): void {
    if (!this.client || !this.scene) return;

    console.log('[PUZZLE] Puzzle closed by user:', tileIndex);

    // Hide and dispose puzzle UI
    if (this.currentPuzzle) {
      this.currentPuzzle.hide();
      this.currentPuzzle.dispose();
      this.currentPuzzle = null;
    }

    // Re-enable pointer lock for FPS controls
    if (this.raycast) {
      this.raycast.enablePointerLock();
    }

    // Send cancel to server to release tile
    this.client.sendPuzzleCancel(tileIndex);
  }

  /**
   * Handle puzzle completion (success or failure)
   */
  private handlePuzzleComplete(tileIndex: number, success: boolean, answerIndex: number): void {
    if (!this.client || !this.scene) return;

    console.log('[PUZZLE] Submitting puzzle result:', { tileIndex, success, answerIndex });

    // Play failure sound if puzzle failed
    if (!success && this.scene) {
      this.scene.getSound().play('puzzleFailed');
    }

    // Hide and dispose puzzle UI
    if (this.currentPuzzle) {
      this.currentPuzzle.hide();
      this.currentPuzzle.dispose();
      this.currentPuzzle = null;
    }

    // Re-enable pointer lock for FPS controls
    if (this.raycast) {
      this.raycast.enablePointerLock();
    }

    // Re-lock pointer
    const canvas = this.scene.getScene().getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.requestPointerLock();
      console.log('[PUZZLE] Pointer re-locked for FPS controls');
    }

    // Send puzzle result to server (server validates answerIndex)
    this.client.sendPuzzleResult(tileIndex, success, answerIndex);
  }

  /**
   * Setup ESC menu with keyboard listener and callbacks
   */
  private setupEscMenu(): void {
    if (!this.scene || !this.escMenuGUI || !this.client) return;

    const scene = this.scene.getScene();
    const canvas = scene.getEngine().getRenderingCanvas();

    // Listen for pointer lock release (browser auto-releases on ESC)
    // This fixes the "2 ESC presses required" issue - browser consumes first ESC to exit pointer lock
    document.addEventListener('pointerlockchange', () => {
      const isLocked = document.pointerLockElement === canvas;

      // Pointer lock was just released - show ESC menu if appropriate
      if (!isLocked &&
          !this.escMenuGUI?.getIsVisible() &&
          !this.nameInputGUI?.getIsVisible() &&
          !this.currentPuzzle &&
          !this.helpGUI?.getIsVisible()) {
        this.openEscMenu();
      }
    });

    // ESC key listener (for closing menu and help)
    scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.type === KeyboardEventTypes.KEYDOWN && kbInfo.event.key === 'Escape') {
        // Don't process if name input or puzzle is visible
        if (this.nameInputGUI?.getIsVisible() || this.currentPuzzle) {
          return;
        }

        // If help is visible, close it first
        if (this.helpGUI?.getIsVisible()) {
          this.helpGUI.hide();
          return;
        }

        // Close ESC menu if visible (opening is handled by pointerlockchange)
        if (this.escMenuGUI?.getIsVisible()) {
          this.closeEscMenu();
        }
      }
    });

    // Resume callback - close menu and re-lock pointer
    this.escMenuGUI.onResume(() => {
      this.closeEscMenu();
    });

    // Respawn callback
    this.escMenuGUI.onRespawn(() => {
      console.log('[ESC_MENU] Respawn requested');
      this.client?.sendRespawn();
      this.closeEscMenu();
    });

    // Help callback - show HelpGUI
    this.escMenuGUI.onHelp(() => {
      console.log('[ESC_MENU] Help requested');
      this.helpGUI?.show();
    });

    // When help closes, show ESC menu again or resume game
    this.helpGUI?.onClose(() => {
      console.log('[HELP] Help closed');
      // Re-show ESC menu so user can choose what to do next
      this.escMenuGUI?.show();
    });
  }

  /**
   * Open ESC menu - release pointer and show menu
   */
  private openEscMenu(): void {
    if (!this.escMenuGUI || !this.scene) return;

    console.log('[ESC_MENU] Opening menu');

    // Release pointer lock
    document.exitPointerLock();

    // Disable automatic pointer lock
    if (this.raycast) {
      this.raycast.disablePointerLock();
    }

    // Detach camera controls
    const canvas = this.scene.getScene().getEngine().getRenderingCanvas();
    if (canvas) {
      this.scene.getCamera().getCamera().detachControl();
    }

    // Show menu
    this.escMenuGUI.show();
  }

  /**
   * Close ESC menu - re-lock pointer and resume game
   */
  private closeEscMenu(): void {
    if (!this.escMenuGUI || !this.scene) return;

    console.log('[ESC_MENU] Closing menu');

    // Hide menu
    this.escMenuGUI.hide();

    // Reattach camera controls
    const canvas = this.scene.getScene().getEngine().getRenderingCanvas();
    if (canvas) {
      this.scene.getCamera().getCamera().attachControl(canvas, true);
    }

    // Re-enable pointer lock (delayed to prevent immediate re-trigger)
    setTimeout(() => {
      if (this.raycast) {
        this.raycast.enablePointerLock();
      }
      // Re-lock pointer
      const canvas = this.scene?.getScene().getEngine().getRenderingCanvas();
      if (canvas) {
        canvas.requestPointerLock();
      }
    }, 100);
  }

  /**
   * Setup disconnect handler to show GUI when connection is lost
   */
  private setupDisconnectHandler(): void {
    if (!this.room || !this.disconnectGUI) return;

    // Listen for room leave event (disconnect)
    this.room.onLeave((code: number) => {
      console.log('[DISCONNECT] Connection lost with code:', code);

      // Determine message based on disconnect code
      // https://docs.colyseus.io/colyseus/client/#onleave
      let message: string;
      if (code === 1000) {
        // Normal closure - user left intentionally
        message = 'You have disconnected from the server.';
      } else if (code === 1006) {
        // Abnormal closure - connection lost without close frame
        message = 'Connection was lost unexpectedly. The server may be down.';
      } else if (code >= 4000 && code < 5000) {
        // Application-specific codes
        message = `Disconnected by server (code: ${code}).`;
      } else {
        message = `Connection lost (code: ${code}). Please reload to reconnect.`;
      }

      // Hide other GUIs
      this.escMenuGUI?.hide();
      this.helpGUI?.hide();
      if (this.currentPuzzle) {
        this.currentPuzzle.dispose();
        this.currentPuzzle = null;
      }

      // Permanently disable player input (cannot re-enable after disconnect)
      if (this.raycast) {
        this.raycast.permanentlyDisablePointerLock();
      }

      // Detach camera controls to fully release mouse
      if (this.scene) {
        const canvas = this.scene.getScene().getEngine().getRenderingCanvas();
        if (canvas) {
          this.scene.getCamera().getCamera().detachControl();
        }
      }

      // Show disconnect GUI
      this.disconnectGUI?.show(message);
    });

    // Also listen for room errors
    this.room.onError((code: number, message?: string) => {
      console.error('[DISCONNECT] Room error:', code, message);
      // Don't show disconnect GUI for errors - let onLeave handle actual disconnections
    });
  }
}

// Start the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const game = new BlockGame();
  game.init();
});
