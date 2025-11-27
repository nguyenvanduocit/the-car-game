import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
} from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Control,
  StackPanel,
} from '@babylonjs/gui';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';

const BOARD_WIDTH = 20;
const BOARD_HEIGHT = 14;
const MAX_ENTRIES_PER_COLUMN = 24;

interface EntryRow {
  container: Rectangle;
  textBlock: TextBlock;
}

/**
 * LeaderboardWall - Physical wall in game world displaying leaderboard
 * Shows top 50 players in 2 columns: 1-24 (left) and 25-50 (right)
 * Optimized: reuses GUI elements instead of recreating on each update
 */
export class LeaderboardWall {
  private scene: Scene;

  // Single wall with two columns
  private wallMesh: Mesh;
  private guiTexture: AdvancedDynamicTexture;

  // Left column (ranks 1-24)
  private leftStackPanel: StackPanel;
  private leftEntryRows: EntryRow[] = [];

  // Right column (ranks 25-50)
  private rightStackPanel: StackPanel;
  private rightEntryRows: EntryRow[] = [];

  /**
   * Create leaderboard wall at specified position
   * @param scene BabylonJS scene
   * @param position Wall position in 3D space
   */
  constructor(scene: Scene, position: Vector3 = new Vector3(50, 7, -30)) {
    this.scene = scene;

    // On east (right) wall, face toward -X (center of play area)
    const rotation = Math.PI / 2;

    // Create single wall
    this.wallMesh = this.createWallMesh('leaderboardWall', position, rotation);
    this.guiTexture = AdvancedDynamicTexture.CreateForMesh(
      this.wallMesh,
      1400,
      1024
    );

    // Create the two-column UI
    const { leftStack, rightStack } = this.createTwoColumnUI(this.guiTexture);
    this.leftStackPanel = leftStack;
    this.rightStackPanel = rightStack;

    // Create entry pools for each column
    this.leftEntryRows = this.createEntryPool(this.leftStackPanel, MAX_ENTRIES_PER_COLUMN, 'left');
    this.rightEntryRows = this.createEntryPool(this.rightStackPanel, MAX_ENTRIES_PER_COLUMN, 'right');

    console.log('[LEADERBOARD WALL] Created single board with 2 columns at position:', position);
  }

  /**
   * Create wall mesh (vertical plane)
   */
  private createWallMesh(name: string, position: Vector3, rotationY: number): Mesh {
    const wall = MeshBuilder.CreatePlane(
      name,
      { width: BOARD_WIDTH, height: BOARD_HEIGHT },
      this.scene
    );

    wall.position = position.clone();
    wall.rotation.y = rotationY;

    const material = new StandardMaterial(`${name}Material`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.2, 0.25);
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    material.emissiveColor = new Color3(0.05, 0.05, 0.1);
    wall.material = material;
    wall.receiveShadows = true;

    return wall;
  }

  /**
   * Create a pool of reusable entry rows for a stack panel
   */
  private createEntryPool(stackPanel: StackPanel, count: number, prefix: string): EntryRow[] {
    const rows: EntryRow[] = [];
    for (let i = 0; i < count; i++) {
      const container = new Rectangle(`${prefix}_entry_${i}`);
      container.height = '32px';
      container.thickness = 0;
      container.isVisible = false;

      const textBlock = new TextBlock(`${prefix}_entryText_${i}`, '');
      textBlock.fontSize = 28;
      textBlock.color = '#ffffff';
      textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      textBlock.paddingLeft = '15px';

      container.addControl(textBlock);
      stackPanel.addControl(container);
      rows.push({ container, textBlock });
    }
    return rows;
  }

  /**
   * Create two-column UI layout (flat structure for performance)
   * Arcade/neon game aesthetic
   */
  private createTwoColumnUI(texture: AdvancedDynamicTexture): { leftStack: StackPanel; rightStack: StackPanel } {
    // Main container - dark with cyan glow border
    const container = new Rectangle('container');
    container.width = '1350px';
    container.height = '980px';
    container.background = 'rgba(5, 10, 20, 0.95)';
    container.thickness = 6;
    container.color = '#00ffff';
    container.cornerRadius = 8;
    texture.addControl(container);

    // Inner glow line (second border effect)
    const innerBorder = new Rectangle('innerBorder');
    innerBorder.width = '1330px';
    innerBorder.height = '960px';
    innerBorder.thickness = 2;
    innerBorder.color = 'rgba(0, 255, 255, 0.3)';
    innerBorder.background = 'transparent';
    innerBorder.cornerRadius = 4;
    container.addControl(innerBorder);

    // Main title - arcade style
    const titleText = new TextBlock('title', 'HIGH SCORES');
    titleText.height = '80px';
    titleText.top = '20px';
    titleText.fontSize = 52;
    titleText.color = '#00ffff';
    titleText.fontWeight = 'bold';
    titleText.shadowColor = '#00ffff';
    titleText.shadowBlur = 15;
    titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    container.addControl(titleText);

    // Divider line under title
    const titleDivider = new Rectangle('titleDivider');
    titleDivider.width = '1200px';
    titleDivider.height = '3px';
    titleDivider.top = '100px';
    titleDivider.background = 'linear-gradient(90deg, transparent, #00ffff, transparent)';
    titleDivider.thickness = 0;
    titleDivider.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    container.addControl(titleDivider);

    // Left column header - TOP PLAYERS
    const leftTitle = new TextBlock('leftTitle', '★ TOP 24 ★');
    leftTitle.height = '45px';
    leftTitle.top = '115px';
    leftTitle.left = '-325px';
    leftTitle.fontSize = 28;
    leftTitle.color = '#ffdd00';
    leftTitle.fontWeight = 'bold';
    leftTitle.shadowColor = '#ffdd00';
    leftTitle.shadowBlur = 10;
    leftTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    leftTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(leftTitle);

    // Left stack
    const leftStack = new StackPanel('leftStack');
    leftStack.top = '165px';
    leftStack.left = '-340px';
    leftStack.width = '620px';
    leftStack.height = '800px';
    leftStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    leftStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(leftStack);

    // Center divider line
    const centerDivider = new Rectangle('centerDivider');
    centerDivider.width = '3px';
    centerDivider.height = '820px';
    centerDivider.top = '140px';
    centerDivider.background = 'rgba(0, 255, 255, 0.4)';
    centerDivider.thickness = 0;
    centerDivider.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    container.addControl(centerDivider);

    // Right column header
    const rightTitle = new TextBlock('rightTitle', 'RANK 25-50');
    rightTitle.height = '45px';
    rightTitle.top = '115px';
    rightTitle.left = '325px';
    rightTitle.fontSize = 28;
    rightTitle.color = '#888899';
    rightTitle.fontWeight = 'bold';
    rightTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    rightTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(rightTitle);

    // Right stack
    const rightStack = new StackPanel('rightStack');
    rightStack.top = '165px';
    rightStack.left = '340px';
    rightStack.width = '620px';
    rightStack.height = '800px';
    rightStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    rightStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(rightStack);

    return { leftStack, rightStack };
  }

  /**
   * Get rank indicator for arcade style
   */
  private getRankIndicator(rank: number): string {
    switch (rank) {
      case 1: return '►1ST';
      case 2: return ' 2ND';
      case 3: return ' 3RD';
      default: return `  ${rank < 10 ? ' ' : ''}${rank}.`;
    }
  }

  /**
   * Update leaderboard with all-time player data
   * @param leaderboard Array of all-time entries from database (up to 50)
   */
  updateLeaderboard(leaderboard: Array<{ rank: number; displayName: string; tilesPlaced: number; gamesPlayed?: number }>): void {
    // Split into two groups: 1-24 (left column) and 25-50 (right column)
    const leftColumn = leaderboard.slice(0, 24);
    const rightColumn = leaderboard.slice(24, 50);

    // Update left column (ranks 1-24)
    this.updateColumnEntries(this.leftEntryRows, leftColumn, true);

    // Update right column (ranks 25-50)
    this.updateColumnEntries(this.rightEntryRows, rightColumn, false);
  }

  /**
   * Update entries for a column using pooled rows
   * Arcade-style coloring
   */
  private updateColumnEntries(
    entryRows: EntryRow[],
    entries: Array<{ rank: number; displayName: string; tilesPlaced: number }>,
    isLeftColumn: boolean
  ): void {
    for (let i = 0; i < entryRows.length; i++) {
      const row = entryRows[i];
      const entry = entries[i];

      if (entry) {
        row.container.isVisible = true;

        // Arcade-style backgrounds
        if (entry.rank === 1) {
          row.container.background = 'rgba(255, 200, 0, 0.25)';
        } else if (entry.rank === 2) {
          row.container.background = 'rgba(180, 180, 200, 0.15)';
        } else if (entry.rank === 3) {
          row.container.background = 'rgba(200, 120, 50, 0.15)';
        } else if (entry.rank <= 10) {
          row.container.background = 'rgba(0, 255, 255, 0.05)';
        } else {
          row.container.background = 'transparent';
        }

        // Truncate long names
        const maxNameLen = 18;
        const name = entry.displayName.length > maxNameLen
          ? entry.displayName.slice(0, maxNameLen) + '..'
          : entry.displayName;

        // Update text - arcade format: rank indicator | name | score
        const rankInd = this.getRankIndicator(entry.rank);
        const score = entry.tilesPlaced.toString().padStart(4, ' ');
        row.textBlock.text = `${rankInd}  ${name.padEnd(20, ' ')} ${score}`;
        row.textBlock.fontSize = 26;
        row.textBlock.fontWeight = entry.rank <= 3 ? 'bold' : 'normal';

        // Arcade colors: gold > silver > bronze > cyan > white
        if (entry.rank === 1) {
          row.textBlock.color = '#ffcc00';
          row.textBlock.shadowColor = '#ffcc00';
          row.textBlock.shadowBlur = 8;
        } else if (entry.rank === 2) {
          row.textBlock.color = '#c0c0d0';
          row.textBlock.shadowColor = '#c0c0d0';
          row.textBlock.shadowBlur = 5;
        } else if (entry.rank === 3) {
          row.textBlock.color = '#dd9944';
          row.textBlock.shadowColor = '#dd9944';
          row.textBlock.shadowBlur = 5;
        } else if (entry.rank <= 10) {
          row.textBlock.color = '#66dddd';
          row.textBlock.shadowBlur = 0;
        } else {
          row.textBlock.color = isLeftColumn ? '#aabbcc' : '#778899';
          row.textBlock.shadowBlur = 0;
        }
      } else {
        row.container.isVisible = false;
      }
    }

    // Show empty message if no entries
    if (entries.length === 0 && entryRows.length > 0) {
      const row = entryRows[0];
      row.container.isVisible = true;
      row.container.background = 'transparent';
      row.textBlock.text = isLeftColumn ? '- NO SCORES YET -' : '---';
      row.textBlock.fontSize = 26;
      row.textBlock.fontWeight = 'normal';
      row.textBlock.color = '#445566';
      row.textBlock.shadowBlur = 0;
    }
  }

  /**
   * Enable shadow casting on wall
   */
  enableShadowCasting(shadowGenerator: ShadowGenerator): void {
    shadowGenerator.addShadowCaster(this.wallMesh);
    console.log('[LEADERBOARD WALL] Shadow casting enabled');
  }

  /**
   * Get wall mesh
   */
  getMesh(): Mesh {
    return this.wallMesh;
  }

  /**
   * Get all wall meshes (for compatibility)
   */
  getMeshes(): Mesh[] {
    return [this.wallMesh];
  }

  /**
   * Dispose wall and GUI
   */
  dispose(): void {
    this.guiTexture.dispose();
    this.wallMesh.dispose();
  }
}
