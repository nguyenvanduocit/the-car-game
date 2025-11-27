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
 * EscMenuGUI - In-game escape menu
 * Shows when player presses ESC, releases pointer lock
 * Options: Resume, Respawn, Help, About
 */
export class EscMenuGUI {
  private texture: AdvancedDynamicTexture;
  private container: Rectangle;
  private isVisible: boolean = false;

  // Callbacks
  private onResumeCallback: (() => void) | null = null;
  private onRespawnCallback: (() => void) | null = null;
  private onHelpCallback: (() => void) | null = null;

  constructor(scene: Scene) {
    // Create fullscreen GUI texture
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI('EscMenuUI', true, scene);
    this.texture.idealWidth = 1920;

    // Semi-transparent overlay
    const overlay = new Rectangle('overlay');
    overlay.width = '100%';
    overlay.height = '100%';
    overlay.background = 'rgba(0, 0, 0, 0.7)';
    overlay.thickness = 0;
    overlay.isVisible = false;
    this.texture.addControl(overlay);

    // Main container
    this.container = new Rectangle('escMenuContainer');
    this.container.width = '400px';
    this.container.height = '450px';
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
    const stack = new StackPanel('menuStack');
    stack.isVertical = true;
    stack.spacing = 15;
    stack.paddingTop = '30px';
    stack.paddingBottom = '30px';
    this.container.addControl(stack);

    // Title
    const title = new TextBlock('title', 'PAUSED');
    title.fontFamily = 'system-ui, -apple-system, sans-serif';
    title.fontSize = 32;
    title.color = 'white';
    title.fontWeight = '700';
    title.height = '50px';
    stack.addControl(title);

    // Subtitle
    const subtitle = new TextBlock('subtitle', 'Press ESC to resume');
    subtitle.fontFamily = 'system-ui, -apple-system, sans-serif';
    subtitle.fontSize = 14;
    subtitle.color = 'rgba(255, 255, 255, 0.5)';
    subtitle.height = '30px';
    stack.addControl(subtitle);

    // Spacer
    const spacer = new Rectangle('spacer');
    spacer.height = '20px';
    spacer.thickness = 0;
    spacer.background = 'transparent';
    stack.addControl(spacer);

    // Resume button
    const resumeBtn = this.createButton('resumeBtn', 'Resume', '#7A42F4');
    resumeBtn.onPointerClickObservable.add(() => {
      this.hide();
      if (this.onResumeCallback) {
        this.onResumeCallback();
      }
    });
    stack.addControl(resumeBtn);

    // Respawn button
    const respawnBtn = this.createButton('respawnBtn', 'Respawn', '#E67E22');
    respawnBtn.onPointerClickObservable.add(() => {
      this.hide();
      if (this.onRespawnCallback) {
        this.onRespawnCallback();
      }
    });
    stack.addControl(respawnBtn);

    // Help button
    const helpBtn = this.createButton('helpBtn', 'Help', '#3498DB');
    helpBtn.onPointerClickObservable.add(() => {
      this.hide();
      if (this.onHelpCallback) {
        this.onHelpCallback();
      }
    });
    stack.addControl(helpBtn);

    // About section (simple text)
    const aboutSpacer = new Rectangle('aboutSpacer');
    aboutSpacer.height = '20px';
    aboutSpacer.thickness = 0;
    aboutSpacer.background = 'transparent';
    stack.addControl(aboutSpacer);

    const aboutText = new TextBlock('about', 'BlockGame v1.0\nA multiplayer puzzle racing game');
    aboutText.fontFamily = 'system-ui, -apple-system, sans-serif';
    aboutText.fontSize = 12;
    aboutText.color = 'rgba(255, 255, 255, 0.4)';
    aboutText.height = '40px';
    aboutText.textWrapping = true;
    stack.addControl(aboutText);
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
   * Show menu
   */
  show(): void {
    const overlay = (this.container as any)._overlay;
    if (overlay) overlay.isVisible = true;
    this.container.isVisible = true;
    this.isVisible = true;
  }

  /**
   * Hide menu
   */
  hide(): void {
    const overlay = (this.container as any)._overlay;
    if (overlay) overlay.isVisible = false;
    this.container.isVisible = false;
    this.isVisible = false;
  }

  /**
   * Toggle menu visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if menu is visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Set resume callback
   */
  onResume(callback: () => void): void {
    this.onResumeCallback = callback;
  }

  /**
   * Set respawn callback
   */
  onRespawn(callback: () => void): void {
    this.onRespawnCallback = callback;
  }

  /**
   * Set help callback
   */
  onHelp(callback: () => void): void {
    this.onHelpCallback = callback;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.texture.dispose();
  }
}
