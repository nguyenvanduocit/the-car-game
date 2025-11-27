import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Control,
  StackPanel,
} from '@babylonjs/gui';

/**
 * PlayGuideGUI - Displays gameplay instructions
 * Shows in bottom-left corner of screen
 */
export class PlayGuideGUI {
  private advancedTexture: AdvancedDynamicTexture;
  private container: Rectangle;
  private isVisible: boolean = true;

  constructor(advancedTexture: AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;

    // Create container
    this.container = new Rectangle('playGuideContainer');
    this.container.width = '320px';
    this.container.height = '180px';
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.container.top = '-20px';
    this.container.left = '20px';
    this.container.background = 'rgba(0, 0, 0, 0.7)';
    this.container.thickness = 2;
    this.container.color = '#ff69b4'; // Pink border to match theme
    this.container.cornerRadius = 10;
    this.advancedTexture.addControl(this.container);

    // Create stack panel for guide entries
    const stackPanel = new StackPanel('guideStack');
    stackPanel.width = '300px';
    stackPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    stackPanel.top = '10px';
    this.container.addControl(stackPanel);

    // Instructions
    const instructions = [
      { key: 'WASD', desc: 'Move around' },
      { key: 'Mouse', desc: 'Look around' },
      { key: 'Left Click', desc: 'Pick up tile on floor' },
      { key: 'Right Click', desc: 'Shoot tiles (charge & release)' },
    ];

    instructions.forEach((instruction, index) => {
      const line = this.createInstructionLine(instruction.key, instruction.desc);
      stackPanel.addControl(line);

      // Add small spacer between lines
      if (index < instructions.length - 1) {
        stackPanel.addControl(this.createSpacer(8));
      }
    });

    console.log('[PLAY GUIDE] Gameplay guide created');
  }

  /**
   * Create instruction line with key and description
   */
  private createInstructionLine(key: string, description: string): Rectangle {
    const lineContainer = new Rectangle();
    lineContainer.height = '30px';
    lineContainer.thickness = 0;
    lineContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    // Key text (bold, colored)
    const keyText = new TextBlock();
    keyText.text = key;
    keyText.fontFamily = 'Arial, Helvetica, sans-serif';
    keyText.fontSize = 14;
    keyText.color = '#ffcc00'; // Yellow for keys
    keyText.fontWeight = 'bold';
    keyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    keyText.paddingLeft = '10px';
    keyText.width = '120px';
    keyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    lineContainer.addControl(keyText);

    // Description text (normal, white)
    const descText = new TextBlock();
    descText.text = description;
    descText.fontFamily = 'Arial, Helvetica, sans-serif';
    descText.fontSize = 13;
    descText.color = '#ffffff';
    descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descText.paddingLeft = '130px';
    descText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    lineContainer.addControl(descText);

    return lineContainer;
  }

  /**
   * Create text block
   */
  private createText(text: string, fontSize: number, bold: boolean = false, color: string = '#ffffff'): TextBlock {
    const textBlock = new TextBlock();
    textBlock.text = text;
    textBlock.fontSize = fontSize;
    textBlock.color = color;
    textBlock.height = '25px';
    if (bold) {
      textBlock.fontWeight = 'bold';
    }
    return textBlock;
  }

  /**
   * Create spacer
   */
  private createSpacer(height: number): Rectangle {
    const spacer = new Rectangle();
    spacer.height = `${height}px`;
    spacer.thickness = 0;
    return spacer;
  }

  /**
   * Show the guide
   */
  show(): void {
    if (!this.isVisible) {
      this.container.isVisible = true;
      this.isVisible = true;
    }
  }

  /**
   * Hide the guide
   */
  hide(): void {
    if (this.isVisible) {
      this.container.isVisible = false;
      this.isVisible = false;
    }
  }

  /**
   * Toggle guide visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Dispose the guide
   */
  dispose(): void {
    this.container.dispose();
  }
}
