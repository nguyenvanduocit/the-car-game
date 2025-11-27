import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Button,
  Control,
  StackPanel,
} from '@babylonjs/gui';
import type { Scene } from '@babylonjs/core';

/**
 * DisconnectGUI - Shows when connection to server is lost
 * Displays disconnect message and reload button
 */
export class DisconnectGUI {
  private texture: AdvancedDynamicTexture;
  private container: Rectangle;
  private isVisible: boolean = false;
  private messageText: TextBlock;

  constructor(scene: Scene) {
    // Create fullscreen GUI texture
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI('DisconnectUI', true, scene);
    this.texture.idealWidth = 1920;

    // Semi-transparent overlay
    const overlay = new Rectangle('overlay');
    overlay.width = '100%';
    overlay.height = '100%';
    overlay.background = 'rgba(0, 0, 0, 0.85)';
    overlay.thickness = 0;
    overlay.isVisible = false;
    this.texture.addControl(overlay);

    // Main container
    this.container = new Rectangle('disconnectContainer');
    this.container.width = '450px';
    this.container.height = '320px';
    this.container.cornerRadius = 20;
    this.container.thickness = 0;
    this.container.background = '#2A2A2E';
    this.container.shadowColor = 'black';
    this.container.shadowBlur = 30;
    this.container.shadowOffsetX = 0;
    this.container.shadowOffsetY = 10;
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.isVisible = false;
    overlay.addControl(this.container);

    // Store overlay reference on container for toggle
    (this.container as any)._overlay = overlay;

    // Stack panel for content
    const stack = new StackPanel('disconnectStack');
    stack.isVertical = true;
    stack.spacing = 15;
    stack.paddingTop = '40px';
    stack.paddingBottom = '40px';
    this.container.addControl(stack);

    // Warning icon
    const icon = new TextBlock('icon', '⚠️');
    icon.fontSize = 48;
    icon.height = '65px';
    stack.addControl(icon);

    // Title
    const title = new TextBlock('title', 'CONNECTION LOST');
    title.fontFamily = 'system-ui, -apple-system, sans-serif';
    title.fontSize = 28;
    title.color = '#E74C3C';
    title.fontWeight = '700';
    title.height = '40px';
    stack.addControl(title);

    // Message
    this.messageText = new TextBlock('message', 'The connection to the server was lost.');
    this.messageText.fontFamily = 'system-ui, -apple-system, sans-serif';
    this.messageText.fontSize = 16;
    this.messageText.color = 'rgba(255, 255, 255, 0.7)';
    this.messageText.height = '45px';
    this.messageText.textWrapping = true;
    stack.addControl(this.messageText);

    // Spacer
    const spacer = new Rectangle('spacer');
    spacer.height = '15px';
    spacer.thickness = 0;
    spacer.background = 'transparent';
    stack.addControl(spacer);

    // Reload button
    const reloadBtn = this.createButton('reloadBtn', 'Reload Page', '#E74C3C');
    reloadBtn.onPointerClickObservable.add(() => {
      window.location.reload();
    });
    stack.addControl(reloadBtn);
  }

  /**
   * Create styled button
   */
  private createButton(name: string, text: string, bgColor: string): Button {
    const btn = Button.CreateSimpleButton(name, text);
    btn.width = '300px';
    btn.height = '50px';
    btn.color = 'white';
    btn.background = bgColor;
    btn.cornerRadius = 12;
    btn.thickness = 0;
    btn.fontFamily = 'system-ui, -apple-system, sans-serif';
    btn.fontSize = 18;
    btn.fontWeight = '500';

    // Hover effects
    const originalBg = bgColor;
    btn.onPointerEnterObservable.add(() => {
      btn.background = this.lightenColor(originalBg, 15);
    });
    btn.onPointerOutObservable.add(() => {
      btn.background = originalBg;
    });

    return btn;
  }

  /**
   * Lighten a hex color
   */
  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  }

  /**
   * Show disconnect GUI with optional custom message
   */
  show(message?: string): void {
    if (message) {
      this.messageText.text = message;
    }

    const overlay = (this.container as any)._overlay;
    if (overlay) overlay.isVisible = true;
    this.container.isVisible = true;
    this.isVisible = true;

    // Release pointer lock so user can click reload button
    document.exitPointerLock();
  }

  /**
   * Hide GUI
   */
  hide(): void {
    const overlay = (this.container as any)._overlay;
    if (overlay) overlay.isVisible = false;
    this.container.isVisible = false;
    this.isVisible = false;
  }

  /**
   * Check if GUI is visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.texture.dispose();
  }
}
