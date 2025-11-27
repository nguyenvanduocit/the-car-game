import { Scene, Vector3, Observer, KeyboardEventTypes, KeyboardInfo } from '@babylonjs/core';
import { PhysicsConstants } from '@blockgame/shared';
import type { ColyseusClient } from '../network/ColyseusClient';
import type { GameCamera } from './Camera';
import type { StateSync } from '../network/StateSync';

/**
 * Player input handler for arrow key movement (SERVER-AUTHORITATIVE)
 * Captures input and sends direction to server
 * Server calculates velocity and handles all physics
 *
 * CLIENT-SIDE PREDICTION:
 * Also sends input state to local VehicleRenderer for immediate visual response
 */
export class PlayerInput {
  private scene: Scene;
  private gameCamera: GameCamera;
  private client: ColyseusClient;
  private stateSync: StateSync | null = null;

  // Input state (arrow keys)
  private keys = {
    arrowup: false,
    arrowleft: false,
    arrowdown: false,
    arrowright: false,
  };

  private observer: Observer<KeyboardInfo> | null = null;

  // Send throttle (matches server physics rate)
  private lastSendTime = 0;
  private sendInterval = 1000 / PhysicsConstants.CLIENT_SEND_RATE;

  constructor(scene: Scene, gameCamera: GameCamera, client: ColyseusClient) {
    this.scene = scene;
    this.gameCamera = gameCamera;
    this.client = client;

    this.setupKeyboardInput();
    this.startUpdateLoop();

    console.log('[INPUT] Player input initialized (server-authoritative mode)');
  }

  /**
   * Set StateSync reference for client-side prediction
   * This allows PlayerInput to send input state directly to local vehicle
   */
  setStateSync(stateSync: StateSync): void {
    this.stateSync = stateSync;
    console.log('[INPUT] Client-side prediction enabled');
  }

  /**
   * Setup keyboard input listeners for arrow keys
   */
  private setupKeyboardInput(): void {
    this.observer = this.scene.onKeyboardObservable.add((kbInfo) => {
      const key = kbInfo.event.key.toLowerCase();

      if (key in this.keys) {
        if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
          this.keys[key as keyof typeof this.keys] = true;
        } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
          this.keys[key as keyof typeof this.keys] = false;
        }
      }
    });
  }

  /**
   * Start update loop to calculate and send movement
   */
  private startUpdateLoop(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  /**
   * Update movement and send to server (SERVER-AUTHORITATIVE)
   * Called every frame (60fps), but throttled to match server rate for network
   */
  private update(): void {
    // Calculate car controls from input (throttle + steering)
    const controls = this.calculateCarControls();

    // CLIENT-SIDE PREDICTION: Send input state to local vehicle EVERY FRAME
    // This provides immediate visual response before server confirms
    if (this.stateSync) {
      const localPlayer = this.stateSync.getLocalPlayer();
      if (localPlayer) {
        localPlayer.setInputState(controls.throttle, controls.steering);
      }
    }

    // Send to server (throttled to match server physics rate)
    const now = performance.now();
    if (now - this.lastSendTime >= this.sendInterval) {
      this.sendCarControlsToServer(controls);
      this.lastSendTime = now;
    }
  }

  /**
   * Calculate car controls from arrow key input
   * Up/Down = throttle (forward/backward)
   * Left/Right = steering (turn left/right)
   * Returns { throttle: -1 to 1, steering: -1 to 1 }
   */
  private calculateCarControls(): { throttle: number; steering: number } {
    // Throttle: Up = forward (+1), Down = backward (-1)
    const throttle = (this.keys.arrowup ? 1 : 0) - (this.keys.arrowdown ? 1 : 0);

    // Steering: Right = turn right (+1), Left = turn left (-1)
    const steering = (this.keys.arrowright ? 1 : 0) - (this.keys.arrowleft ? 1 : 0);

    return { throttle, steering };
  }

  /**
   * Send car controls to server (SERVER-AUTHORITATIVE)
   * Server will apply throttle as forward force and steering as angular velocity
   */
  private sendCarControlsToServer(controls: { throttle: number; steering: number }): void {
    // Send car controls to server (camera rotation is no longer used for movement)
    this.client.sendMovement(
      {
        x: controls.throttle,  // Repurpose x for throttle
        y: 0,                  // Unused (was y direction)
        z: controls.steering,  // Repurpose z for steering
      },
      0 // Camera rotation no longer affects car direction
    );
  }

  /**
   * Dispose input handler
   */
  dispose(): void {
    if (this.observer) {
      this.scene.onKeyboardObservable.remove(this.observer);
      this.observer = null;
    }
  }
}
