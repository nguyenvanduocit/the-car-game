import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Control,
  StackPanel,
} from '@babylonjs/gui';

export interface LeaderboardData {
  rank: number;
  displayName: string;
  tilesPlaced: number;
  sessionId: string;
}

export interface AllTimeLeaderboardData {
  rank: number;
  displayName: string;
  tilesPlaced: number;
  gamesPlayed: number;
}

/**
 * LeaderboardGUI - Displays player rankings by tiles placed
 * Shows both session and all-time leaderboards in top-right corner
 */
export class LeaderboardGUI {
  private advancedTexture: AdvancedDynamicTexture;
  private container: Rectangle;
  private sessionTitleText: TextBlock;
  private sessionStackPanel: StackPanel;
  private allTimeTitleText: TextBlock;
  private allTimeStackPanel: StackPanel;
  private isVisible: boolean = true;
  private currentSessionId: string = '';

  constructor(advancedTexture: AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;

    // Create container (taller to fit both leaderboards)
    this.container = new Rectangle('leaderboardContainer');
    this.container.width = '280px';
    this.container.height = '520px';
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.top = '20px';
    this.container.left = '-20px';
    this.container.background = 'rgba(0, 0, 0, 0.8)';
    this.container.thickness = 2;
    this.container.color = '#00ff00';
    this.container.cornerRadius = 10;
    this.advancedTexture.addControl(this.container);

    // SESSION LEADERBOARD SECTION
    this.sessionTitleText = new TextBlock('sessionTitle', '🎮 THIS GAME');
    this.sessionTitleText.height = '30px';
    this.sessionTitleText.top = '10px';
    this.sessionTitleText.fontFamily = 'Arial, Helvetica, sans-serif';
    this.sessionTitleText.fontSize = 16;
    this.sessionTitleText.color = '#00ff00';
    this.sessionTitleText.fontWeight = 'bold';
    this.sessionTitleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(this.sessionTitleText);

    this.sessionStackPanel = new StackPanel('sessionStack');
    this.sessionStackPanel.top = '40px';
    this.sessionStackPanel.width = '260px';
    this.sessionStackPanel.height = '200px';
    this.sessionStackPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(this.sessionStackPanel);

    // ALL-TIME LEADERBOARD SECTION
    this.allTimeTitleText = new TextBlock('allTimeTitle', '🏆 ALL-TIME');
    this.allTimeTitleText.height = '30px';
    this.allTimeTitleText.top = '250px';
    this.allTimeTitleText.fontFamily = 'Arial, Helvetica, sans-serif';
    this.allTimeTitleText.fontSize = 16;
    this.allTimeTitleText.color = '#ffd700';
    this.allTimeTitleText.fontWeight = 'bold';
    this.allTimeTitleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(this.allTimeTitleText);

    this.allTimeStackPanel = new StackPanel('allTimeStack');
    this.allTimeStackPanel.top = '280px';
    this.allTimeStackPanel.width = '260px';
    this.allTimeStackPanel.height = '230px';
    this.allTimeStackPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(this.allTimeStackPanel);
  }

  /**
   * Set the current player's session ID for highlighting
   */
  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Get medal emoji for rank
   */
  private getMedal(rank: number): string {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `${rank}.`;
    }
  }

  /**
   * Update session leaderboard with player data
   * @param leaderboard Array of leaderboard entries from server
   */
  updateLeaderboard(leaderboard: LeaderboardData[]): void {
    this.sessionStackPanel.clearControls();

    const topPlayers = leaderboard.slice(0, 6); // Show top 6 for session

    topPlayers.forEach((entry) => {
      const isCurrentPlayer = entry.sessionId === this.currentSessionId;

      const entryContainer = new Rectangle(`entry_${entry.sessionId}`);
      entryContainer.height = '30px';
      entryContainer.thickness = isCurrentPlayer ? 2 : 0;
      entryContainer.color = isCurrentPlayer ? '#00ffff' : 'transparent';
      entryContainer.cornerRadius = 4;

      // Background: gold for 1st, cyan highlight for current player
      if (entry.rank === 1) {
        entryContainer.background = 'rgba(255, 215, 0, 0.25)';
      } else if (isCurrentPlayer) {
        entryContainer.background = 'rgba(0, 255, 255, 0.15)';
      } else {
        entryContainer.background = 'transparent';
      }

      const medal = this.getMedal(entry.rank);
      const youLabel = isCurrentPlayer ? ' (YOU)' : '';
      const entryText = new TextBlock(
        `entryText_${entry.sessionId}`,
        `${medal} ${entry.displayName}${youLabel} - ${entry.tilesPlaced}`
      );
      entryText.fontFamily = 'Arial, Helvetica, sans-serif';
      entryText.fontSize = 14;
      entryText.fontWeight = isCurrentPlayer ? 'bold' : 'normal';
      entryText.color = entry.rank === 1 ? '#ffd700' : entry.rank <= 3 ? '#c0c0c0' : '#ffffff';
      entryText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      entryText.paddingLeft = '10px';

      entryContainer.addControl(entryText);
      this.sessionStackPanel.addControl(entryContainer);
    });

    if (topPlayers.length === 0) {
      const emptyText = new TextBlock('emptySession', 'No players yet');
      emptyText.height = '30px';
      emptyText.fontSize = 14;
      emptyText.color = '#888888';
      this.sessionStackPanel.addControl(emptyText);
    }
  }

  /**
   * Update all-time leaderboard with persistent player data
   * @param leaderboard Array of all-time entries from database
   */
  updateAllTimeLeaderboard(leaderboard: AllTimeLeaderboardData[]): void {
    this.allTimeStackPanel.clearControls();

    const topPlayers = leaderboard.slice(0, 6); // Show top 6

    topPlayers.forEach((entry) => {
      const entryContainer = new Rectangle(`alltime_${entry.displayName}`);
      entryContainer.height = '34px';
      entryContainer.thickness = 0;
      entryContainer.background = entry.rank === 1 ? 'rgba(255, 215, 0, 0.2)' : 'transparent';

      const medal = this.getMedal(entry.rank);
      const entryText = new TextBlock(
        `alltimeText_${entry.displayName}`,
        `${medal} ${entry.displayName} - ${entry.tilesPlaced}`
      );
      entryText.fontFamily = 'Arial, Helvetica, sans-serif';
      entryText.fontSize = 14;
      entryText.color = entry.rank === 1 ? '#ffd700' : entry.rank <= 3 ? '#c0c0c0' : '#aaaaaa';
      entryText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      entryText.paddingLeft = '10px';

      entryContainer.addControl(entryText);
      this.allTimeStackPanel.addControl(entryContainer);
    });

    if (topPlayers.length === 0) {
      const emptyText = new TextBlock('emptyAllTime', 'No records yet');
      emptyText.height = '30px';
      emptyText.fontSize = 14;
      emptyText.color = '#888888';
      this.allTimeStackPanel.addControl(emptyText);
    }
  }

  /**
   * Toggle leaderboard visibility
   */
  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.isVisible = this.isVisible;
  }

  /**
   * Show leaderboard
   */
  show(): void {
    this.isVisible = true;
    this.container.isVisible = true;
  }

  /**
   * Hide leaderboard
   */
  hide(): void {
    this.isVisible = false;
    this.container.isVisible = false;
  }

  /**
   * Dispose leaderboard GUI
   */
  dispose(): void {
    this.advancedTexture.removeControl(this.container);
    this.container.dispose();
  }
}
