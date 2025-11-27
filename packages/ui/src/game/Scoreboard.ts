import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, DynamicTexture } from '@babylonjs/core';
import { ARCH_DESCRIPTORS } from '@blockgame/shared';

/**
 * Scoreboard - displays goal scores above each goal
 */
export class Scoreboard {
  private scene: Scene;
  private blueScoreBoard: Mesh | null = null;
  private redScoreBoard: Mesh | null = null;
  private blueScoreTexture: DynamicTexture | null = null;
  private redScoreTexture: DynamicTexture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.createScoreboards();
  }

  /**
   * Create scoreboard meshes above each goal
   */
  private createScoreboards(): void {
    const blueGoal = ARCH_DESCRIPTORS.find(a => a.name === 'blue_goal');
    const redGoal = ARCH_DESCRIPTORS.find(a => a.name === 'red_goal');

    if (!blueGoal || !redGoal) {
      console.error('[SCOREBOARD] Goal descriptors not found');
      return;
    }

    // Blue scoreboard (above blue goal)
    this.blueScoreBoard = this.createScoreboardMesh(
      'blue_scoreboard',
      new Vector3(
        blueGoal.position.x,
        blueGoal.position.y + blueGoal.height + 2, // 2 units above goal
        blueGoal.position.z
      ),
      Math.PI // Face toward field center (-Z from north goal)
    );

    this.blueScoreTexture = this.createScoreTexture();
    const blueMaterial = new StandardMaterial('blue_scoreboard_mat', this.scene);
    blueMaterial.diffuseTexture = this.blueScoreTexture;
    blueMaterial.emissiveColor = new Color3(0.1, 0.2, 0.5); // Blue glow
    this.blueScoreBoard.material = blueMaterial;

    // Red scoreboard (above red goal)
    this.redScoreBoard = this.createScoreboardMesh(
      'red_scoreboard',
      new Vector3(
        redGoal.position.x,
        redGoal.position.y + redGoal.height + 2, // 2 units above goal
        redGoal.position.z
      ),
      0 // Face toward field center (+Z from south goal)
    );

    this.redScoreTexture = this.createScoreTexture();
    const redMaterial = new StandardMaterial('red_scoreboard_mat', this.scene);
    redMaterial.diffuseTexture = this.redScoreTexture;
    redMaterial.emissiveColor = new Color3(0.5, 0.1, 0.1); // Red glow
    this.redScoreBoard.material = redMaterial;

    // Update with initial scores (0-0)
    this.updateScores(0, 0);

    console.log('[SCOREBOARD] Created scoreboards above goals');
  }

  /**
   * Create a scoreboard mesh (plane)
   */
  private createScoreboardMesh(name: string, position: Vector3, rotationY: number = 0): Mesh {
    const board = MeshBuilder.CreatePlane(
      name,
      {
        width: 8,
        height: 2.25,
      },
      this.scene
    );

    board.position = position;
    board.rotation.y = rotationY;

    return board;
  }

  /**
   * Create dynamic texture for score display
   */
  private createScoreTexture(): DynamicTexture {
    const texture = new DynamicTexture(
      'score_texture',
      { width: 512, height: 256 },
      this.scene,
      false
    );

    return texture;
  }

  /**
   * Update scoreboard displays
   * @param blueScore Blue goal score
   * @param redScore Red goal score
   */
  updateScores(blueScore: number, redScore: number): void {
    if (this.blueScoreTexture) {
      this.drawScoreText(this.blueScoreTexture, `PromPert: ${-blueScore}`, '#4488FF');
    }

    if (this.redScoreTexture) {
      this.drawScoreText(this.redScoreTexture, `ManyPass: ${-redScore}`, '#FF4444');
    }
  }

  /**
   * Draw score text on texture
   */
  private drawScoreText(texture: DynamicTexture, text: string, color: string = '#FFFFFF'): void {
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    const size = texture.getSize();

    // Clear canvas & lay dark backdrop
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, size.width, size.height);

    // Fit text to available width
    const padding = 32;
    let fontSize = 140;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    while (fontSize > 60) {
      ctx.font = `bold ${fontSize}px Arial`;
      const metrics = ctx.measureText(text);
      const maxWidth = size.width - padding * 2;
      if (metrics.width <= maxWidth) break;
      fontSize -= 8;
    }

    // Add stroke + shadow for readability, then fill with team color
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(6, fontSize * 0.08);
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, size.width / 2, size.height / 2);

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, size.width / 2, size.height / 2);

    texture.update();
  }

  /**
   * Dispose scoreboards
   */
  dispose(): void {
    if (this.blueScoreBoard) {
      this.blueScoreBoard.dispose();
      this.blueScoreBoard = null;
    }

    if (this.redScoreBoard) {
      this.redScoreBoard.dispose();
      this.redScoreBoard = null;
    }

    if (this.blueScoreTexture) {
      this.blueScoreTexture.dispose();
      this.blueScoreTexture = null;
    }

    if (this.redScoreTexture) {
      this.redScoreTexture.dispose();
      this.redScoreTexture = null;
    }
  }
}
