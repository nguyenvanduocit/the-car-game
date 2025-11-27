import { AdvancedDynamicTexture, TextBlock, Control } from '@babylonjs/gui';
import type { Scene } from '@babylonjs/core';

const RESPAWN_TIME_MS = 3000; // 3 seconds - matches server respawnDelay

/**
 * Death countdown GUI - shows big countdown number when player dies
 */
export class DeathCountdownGUI {
  private ui: AdvancedDynamicTexture;
  private countdownText: TextBlock;
  private isActive: boolean = false;
  private startTime: number = 0;
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(scene: Scene) {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('DeathCountdownUI', true, scene);

    // Big countdown number
    this.countdownText = new TextBlock('deathCountdown');
    this.countdownText.fontFamily = 'Arial, Helvetica, sans-serif';
    this.countdownText.text = '3';
    this.countdownText.color = '#FF4444';
    this.countdownText.fontSize = 200;
    this.countdownText.fontWeight = 'bold';
    this.countdownText.outlineWidth = 8;
    this.countdownText.outlineColor = '#000000';
    this.countdownText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.countdownText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.countdownText.isVisible = false;

    this.ui.addControl(this.countdownText);
  }

  /**
   * Start the death countdown
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = Date.now();
    this.countdownText.isVisible = true;
    this.countdownText.text = '3';

    // Update every 100ms for smooth countdown
    this.updateInterval = setInterval(() => {
      this.update();
    }, 100);
  }

  /**
   * Update countdown display
   */
  private update(): void {
    if (!this.isActive) return;

    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, RESPAWN_TIME_MS - elapsed);
    const seconds = Math.ceil(remaining / 1000);

    if (seconds <= 0) {
      this.hide();
    } else {
      this.countdownText.text = String(seconds);
    }
  }

  /**
   * Hide the countdown (called when player respawns)
   */
  hide(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.countdownText.isVisible = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Check if countdown is active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Dispose GUI
   */
  dispose(): void {
    this.hide();
    this.countdownText.dispose();
    this.ui.dispose();
  }
}
