import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Control,
  Button,
  StackPanel,
} from '@babylonjs/gui';
import type { Scene } from '@babylonjs/core';

/**
 * Game completion screen GUI
 * Shows victory message and final leaderboard
 */
export class GameCompleteGUI {
  private ui: AdvancedDynamicTexture;
  private panel: Rectangle | null = null;
  private isVisible: boolean = false;

  constructor(scene: Scene) {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('GameCompleteUI', true, scene);
    this.createUI();
  }

  /**
   * Create the game complete UI elements
   */
  private createUI(): void {
    // Main panel background
    this.panel = new Rectangle('completePanel');
    this.panel.width = '600px';
    this.panel.height = '500px';
    this.panel.cornerRadius = 20;
    this.panel.thickness = 4;
    this.panel.color = '#4CAF50'; // Green border
    this.panel.background = 'rgba(0, 0, 0, 0.85)';
    this.panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.panel.isVisible = false;

    // Container for all content
    const contentStack = new StackPanel('completeContent');
    contentStack.width = '90%';
    contentStack.height = '90%';
    contentStack.spacing = 20;
    contentStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    contentStack.paddingTop = '30px';

    // Victory title
    const title = new TextBlock('completeTitle');
    title.fontFamily = 'Arial, Helvetica, sans-serif';
    title.text = '🎉 PICTURE COMPLETE! 🎉';
    title.color = '#4CAF50'; // Green
    title.fontSize = 42;
    title.fontWeight = 'bold';
    title.height = '60px';
    title.textWrapping = true;
    contentStack.addControl(title);

    // Subtitle
    const subtitle = new TextBlock('completeSubtitle');
    subtitle.fontFamily = 'Arial, Helvetica, sans-serif';
    subtitle.text = 'All tiles have been placed!';
    subtitle.color = '#FFFFFF';
    subtitle.fontSize = 24;
    subtitle.height = '40px';
    contentStack.addControl(subtitle);

    // Leaderboard title
    const leaderboardTitle = new TextBlock('leaderboardTitle');
    leaderboardTitle.fontFamily = 'Arial, Helvetica, sans-serif';
    leaderboardTitle.text = 'FINAL STANDINGS';
    leaderboardTitle.color = '#FFD700'; // Gold
    leaderboardTitle.fontSize = 28;
    leaderboardTitle.fontWeight = 'bold';
    leaderboardTitle.height = '50px';
    leaderboardTitle.paddingTop = '20px';
    contentStack.addControl(leaderboardTitle);

    // Leaderboard container (will be populated dynamically)
    const leaderboardStack = new StackPanel('leaderboardStack');
    leaderboardStack.width = '100%';
    leaderboardStack.height = '250px';
    leaderboardStack.spacing = 8;
    leaderboardStack.metadata = { isLeaderboard: true };
    contentStack.addControl(leaderboardStack);

    // Close button
    const closeButton = Button.CreateSimpleButton('closeButton', 'Continue Playing');
    closeButton.fontFamily = 'Arial, Helvetica, sans-serif';
    closeButton.width = '250px';
    closeButton.height = '50px';
    closeButton.color = '#FFFFFF';
    closeButton.background = '#4CAF50';
    closeButton.cornerRadius = 10;
    closeButton.thickness = 2;
    closeButton.fontSize = 20;
    closeButton.fontWeight = 'bold';
    closeButton.paddingTop = '20px';

    closeButton.onPointerUpObservable.add(() => {
      this.hide();
    });

    contentStack.addControl(closeButton);

    this.panel.addControl(contentStack);
    this.ui.addControl(this.panel);
  }

  /**
   * Show the game complete screen with leaderboard
   */
  show(leaderboard: Array<{ rank: number; displayName: string; tilesPlaced: number }>): void {
    if (!this.panel) return;

    // Update leaderboard content
    this.updateLeaderboard(leaderboard);

    this.panel.isVisible = true;
    this.isVisible = true;

    console.log('[GUI] Game complete screen shown');
  }

  /**
   * Update leaderboard content
   */
  private updateLeaderboard(
    leaderboard: Array<{ rank: number; displayName: string; tilesPlaced: number }>
  ): void {
    if (!this.panel) return;

    // Find leaderboard stack
    const contentStack = this.panel.children[0] as StackPanel;
    let leaderboardStack: StackPanel | null = null;

    for (const child of contentStack.children) {
      if (child.metadata && child.metadata.isLeaderboard) {
        leaderboardStack = child as StackPanel;
        break;
      }
    }

    if (!leaderboardStack) return;

    // Clear existing leaderboard entries
    leaderboardStack.clearControls();

    // Add top 10 players (or fewer if less than 10 players)
    const topPlayers = leaderboard.slice(0, 10);

    topPlayers.forEach((entry) => {
      const entryPanel = new Rectangle(`entry_${entry.rank}`);
      entryPanel.width = '100%';
      entryPanel.height = '35px';
      entryPanel.thickness = 0;
      entryPanel.background = entry.rank === 1 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)';
      entryPanel.cornerRadius = 5;

      const entryText = new TextBlock();
      entryText.fontFamily = 'Arial, Helvetica, sans-serif';
      entryText.text = `${this.getRankEmoji(entry.rank)} ${entry.rank}. ${entry.displayName} - ${entry.tilesPlaced} tiles`;
      entryText.color = entry.rank === 1 ? '#FFD700' : '#FFFFFF';
      entryText.fontSize = entry.rank === 1 ? 22 : 18;
      entryText.fontWeight = entry.rank === 1 ? 'bold' : 'normal';
      entryText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      entryText.paddingLeft = '20px';

      entryPanel.addControl(entryText);
      leaderboardStack.addControl(entryPanel);
    });
  }

  /**
   * Get emoji for rank
   */
  private getRankEmoji(rank: number): string {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return '  ';
    }
  }

  /**
   * Hide the game complete screen
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.isVisible = false;
    this.isVisible = false;

    console.log('[GUI] Game complete screen hidden');
  }

  /**
   * Check if GUI is currently visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Dispose GUI
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
    this.ui.dispose();
  }
}
