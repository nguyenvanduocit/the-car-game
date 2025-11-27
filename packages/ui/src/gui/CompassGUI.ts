import {
  AdvancedDynamicTexture,
  Ellipse,
  TextBlock,
  Control,
  Container,
  Line,
} from '@babylonjs/gui';

/**
 * CompassGUI - Displays a small circular compass showing player direction
 * Shows in bottom-left corner of screen
 */
export class CompassGUI {
  private advancedTexture: AdvancedDynamicTexture;
  private container: Container;
  private compassCircle: Ellipse;
  private innerCircle: Ellipse;
  private needle: Line;
  private cardinalTexts: Map<string, TextBlock> = new Map();
  private coordinateText: TextBlock;
  private isVisible: boolean = true;

  constructor(advancedTexture: AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;

    // Create container for compass
    this.container = new Container('compassContainer');
    this.container.width = '120px';
    this.container.height = '120px';
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.container.left = '20px';
    this.container.top = '-20px';
    this.advancedTexture.addControl(this.container);

    // Outer circle (border)
    this.compassCircle = new Ellipse('compassCircle');
    this.compassCircle.width = '100px';
    this.compassCircle.height = '100px';
    this.compassCircle.thickness = 3;
    this.compassCircle.color = '#ffffff';
    this.compassCircle.background = 'rgba(0, 0, 0, 0.6)';
    this.container.addControl(this.compassCircle);

    // Inner circle (smaller, for visual depth)
    this.innerCircle = new Ellipse('compassInnerCircle');
    this.innerCircle.width = '90px';
    this.innerCircle.height = '90px';
    this.innerCircle.thickness = 1;
    this.innerCircle.color = 'rgba(255, 255, 255, 0.3)';
    this.container.addControl(this.innerCircle);

    // North indicator (red needle pointing up)
    this.needle = new Line('compassNeedle');
    this.needle.lineWidth = 3;
    this.needle.color = '#ff0000';
    this.needle.x1 = 0;
    this.needle.y1 = 0;
    this.needle.x2 = 0;
    this.needle.y2 = -35; // Points upward
    this.container.addControl(this.needle);

    // Cardinal directions (N, S, E, W)
    this.createCardinalText('N', 0, -45, '#ff0000'); // North (red)
    this.createCardinalText('S', 0, 45, '#ffffff');  // South (white)
    this.createCardinalText('E', 45, 0, '#ffffff');  // East (white)
    this.createCardinalText('W', -45, 0, '#ffffff'); // West (white)

    // Coordinate display at center
    this.coordinateText = new TextBlock('compassCoordinates', '0, 0');
    this.coordinateText.fontSize = 12;
    this.coordinateText.color = '#ffffff';
    this.coordinateText.fontFamily = 'monospace';
    this.coordinateText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.coordinateText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.addControl(this.coordinateText);
  }

  /**
   * Create cardinal direction text label
   */
  private createCardinalText(label: string, x: number, y: number, color: string): void {
    const text = new TextBlock(`compass${label}`, label);
    text.fontSize = 16;
    text.color = color;
    text.fontWeight = 'bold';
    text.fontFamily = 'Arial, Helvetica, sans-serif';
    text.left = x;
    text.top = y;
    this.container.addControl(text);
    this.cardinalTexts.set(label, text);
  }

  /**
   * Update compass rotation based on camera yaw and player position
   * @param cameraAlpha Camera's alpha rotation (yaw) in radians
   * @param x Player's x coordinate
   * @param z Player's z coordinate
   */
  update(cameraAlpha: number, x: number, z: number): void {
    // Rotate the entire compass container to show current direction
    // The compass rotates so North always points to actual north
    // and the player can see which direction they're facing
    this.container.rotation = -cameraAlpha;

    // Counter-rotate all text labels so they remain upright and readable
    this.cardinalTexts.forEach((text) => {
      text.rotation = cameraAlpha;
    });

    // Counter-rotate coordinate text to keep it upright
    this.coordinateText.rotation = cameraAlpha;

    // Update coordinate display with rounded values
    this.coordinateText.text = `${Math.round(x)},${Math.round(z)}`;
  }

  /**
   * Show compass
   */
  show(): void {
    this.isVisible = true;
    this.container.isVisible = true;
  }

  /**
   * Hide compass
   */
  hide(): void {
    this.isVisible = false;
    this.container.isVisible = false;
  }

  /**
   * Toggle compass visibility
   */
  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.isVisible = this.isVisible;
  }

  /**
   * Dispose compass GUI
   */
  dispose(): void {
    this.advancedTexture.removeControl(this.container);
    this.container.dispose();
  }
}
