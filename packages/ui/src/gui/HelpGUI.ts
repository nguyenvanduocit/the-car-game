import {
  AdvancedDynamicTexture,
  Rectangle,
  Button,
  Control,
  StackPanel,
  Image,
} from '@babylonjs/gui';
import type { Scene } from '@babylonjs/core';

/**
 * HelpGUI - Shows gameplay and help images
 * Accessible from ESC menu
 */
export class HelpGUI {
  private texture: AdvancedDynamicTexture;
  private overlay: Rectangle;
  private panel: Rectangle;
  private isVisible: boolean = false;

  // Callback when help is closed
  private onCloseCallback: (() => void) | null = null;

  constructor(scene: Scene) {
    // Create fullscreen GUI texture
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI('HelpUI', true, scene);
    this.texture.idealWidth = 1920;

    // Semi-transparent overlay
    this.overlay = new Rectangle('helpOverlay');
    this.overlay.width = '100%';
    this.overlay.height = '100%';
    this.overlay.background = 'rgba(0, 0, 0, 0.9)';
    this.overlay.thickness = 0;
    this.overlay.isVisible = false;
    this.overlay.zIndex = 2000; // Above ESC menu
    this.texture.addControl(this.overlay);

    // Main panel
    this.panel = new Rectangle('helpPanel');
    this.panel.width = '1420px';
    this.panel.height = '600px';
    this.panel.cornerRadius = 16;
    this.panel.color = 'rgba(255, 255, 255, 0.1)';
    this.panel.thickness = 1;
    this.panel.background = 'rgba(0, 0, 0, 0.95)';
    this.panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.overlay.addControl(this.panel);

    // Content stack
    const stack = new StackPanel('helpStack');
    stack.isVertical = true;
    stack.spacing = 16;
    stack.paddingTop = '20px';
    stack.paddingBottom = '20px';
    this.panel.addControl(stack);

    // Horizontal container for both images
    const imagesRow = new StackPanel('imagesRow');
    imagesRow.isVertical = false;
    imagesRow.spacing = 16;
    imagesRow.height = '480px';
    stack.addControl(imagesRow);

    // Gameplay image (left)
    const gameplayImage = new Image('helpGameplayImage', '/gameplay.webp');
    gameplayImage.width = '680px';
    gameplayImage.height = '462px';
    gameplayImage.stretch = Image.STRETCH_UNIFORM;
    imagesRow.addControl(gameplayImage);

    // Help image (right)
    const helpImage = new Image('helpImage', '/help.webp');
    helpImage.width = '680px';
    helpImage.height = '462px';
    helpImage.stretch = Image.STRETCH_UNIFORM;
    imagesRow.addControl(helpImage);

    // Close button
    const closeButton = Button.CreateSimpleButton('closeBtn', 'Close (ESC)');
    closeButton.width = '150px';
    closeButton.height = '45px';
    closeButton.color = 'white';
    closeButton.background = '#7A42F4';
    closeButton.cornerRadius = 10;
    closeButton.thickness = 0;
    closeButton.fontFamily = 'system-ui, -apple-system, sans-serif';
    closeButton.fontSize = 16;
    closeButton.fontWeight = '500';
    stack.addControl(closeButton);

    closeButton.onPointerEnterObservable.add(() => {
      closeButton.background = '#8B5CF5';
    });
    closeButton.onPointerOutObservable.add(() => {
      closeButton.background = '#7A42F4';
    });

    closeButton.onPointerClickObservable.add(() => {
      this.hide();
    });
  }

  /**
   * Show help panel
   */
  show(): void {
    this.overlay.isVisible = true;
    this.isVisible = true;
  }

  /**
   * Hide help panel
   */
  hide(): void {
    this.overlay.isVisible = false;
    this.isVisible = false;
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  /**
   * Check if visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Set close callback
   */
  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.texture.dispose();
  }
}
