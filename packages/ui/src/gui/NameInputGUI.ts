import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  InputText,
  Button,
  Control,
  StackPanel,
  Image,
} from '@babylonjs/gui';
import type { Scene } from '@babylonjs/core';

/**
 * NameInputGUI - BabylonJS GUI for player name entry
 * Displays a fullscreen UI overlay with name input and connect button
 *
 * Implementation follows research.md example for BabylonJS GUI 2D Fullscreen
 */
export class NameInputGUI {
  private static readonly STORAGE_KEY = 'blockgame_username';

  private texture: AdvancedDynamicTexture;
  private joinContainer: Rectangle; // Container for both image and panel (hidden during game)
  private panel: Rectangle;
  private gameplayImagePanel: Rectangle;
  private inputField: InputText;
  private errorText: TextBlock;
  private connectButton: Button;
  private isVisible: boolean = true;

  // Callback for when user clicks connect
  private onConnectCallback: ((name: string) => void) | null = null;

  constructor(scene: Scene) {
    // Create fullscreen GUI texture (renders on top of 3D scene)
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI('NameInputUI', true, scene);
    // Set ideal width for consistent scaling on high-DPI (Retina) displays
    this.texture.idealWidth = 1920;

    // === JOIN CONTAINER: Holds both gameplay image and login panel ===
    this.joinContainer = new Rectangle('joinContainer');
    this.joinContainer.width = '1100px';
    this.joinContainer.height = '780px';
    this.joinContainer.thickness = 0;
    this.joinContainer.background = 'transparent';
    this.joinContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.joinContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.texture.addControl(this.joinContainer);

    // === GAMEPLAY IMAGE PANEL (left side) ===
    this.gameplayImagePanel = new Rectangle('gameplayImagePanel');
    this.gameplayImagePanel.width = '680px';
    this.gameplayImagePanel.height = '780px';
    this.gameplayImagePanel.thickness = 0;
    this.gameplayImagePanel.background = 'transparent';
    this.gameplayImagePanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.gameplayImagePanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.joinContainer.addControl(this.gameplayImagePanel);

    // Stack for help + gameplay images
    const imageStack = new StackPanel('imageStack');
    imageStack.isVertical = true;
    imageStack.spacing = 10;
    this.gameplayImagePanel.addControl(imageStack);

    // Gameplay image (top)
    const gameplayImage = new Image('gameplayImage', '/gameplay.webp');
    gameplayImage.width = '660px';
    gameplayImage.height = '380px';
    gameplayImage.stretch = Image.STRETCH_FILL;
    imageStack.addControl(gameplayImage);

    // Help image (bottom)
    const helpImageJoin = new Image('helpImageJoin', '/help.webp');
    helpImageJoin.width = '660px';
    helpImageJoin.height = '380px';
    helpImageJoin.stretch = Image.STRETCH_FILL;
    imageStack.addControl(helpImageJoin);

    // === LOGIN PANEL (right side) ===
    this.panel = new Rectangle('panel');
    this.panel.width = '380px';
    this.panel.height = '350px';
    this.panel.cornerRadius = 20;
    this.panel.color = 'transparent';
    this.panel.thickness = 0;
    this.panel.background = '#2A2A2E';
    this.panel.shadowColor = 'black';
    this.panel.shadowBlur = 20;
    this.panel.shadowOffsetX = 5;
    this.panel.shadowOffsetY = 5;
    this.panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.joinContainer.addControl(this.panel);

    // Create vertical stack for layout
    const stack = new StackPanel('stack');
    stack.isVertical = true;
    stack.spacing = 20;
    stack.paddingTop = '30px';
    stack.paddingBottom = '30px';
    this.panel.addControl(stack);

    // Add title text
    const title = new TextBlock('title', 'Enter your email');
    title.fontFamily = 'system-ui, -apple-system, sans-serif';
    title.fontSize = 24;
    title.color = 'white';
    title.fontWeight = '600';
    title.height = '40px';
    title.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    stack.addControl(title);

    // Add warning about leaderboard
    const warning = new TextBlock('warning', 'Leaderboard & rewards use this email.\nPlease enter your correct email.');
    warning.fontFamily = 'system-ui, -apple-system, sans-serif';
    warning.fontSize = 14;
    warning.color = '#FFB347';
    warning.height = '50px';
    warning.paddingBottom = '10px';
    warning.textWrapping = true;
    warning.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    stack.addControl(warning);

    // Add name input field
    this.inputField = new InputText('nameInput');
    this.inputField.width = '320px';
    this.inputField.maxWidth = '320px';
    this.inputField.height = '50px';
    this.inputField.text = '';
    this.inputField.placeholderText = 'Your email';
    this.inputField.fontFamily = 'system-ui, -apple-system, sans-serif';
    this.inputField.color = 'white';
    this.inputField.background = '#45454A';
    this.inputField.focusedBackground = '#505055';
    this.inputField.thickness = 0;
    this.inputField.fontSize = 16;
    this.inputField.margin = '10px';
    this.inputField.autoStretchWidth = false;

    // Load saved username from localStorage (pre-fill only, no auto-join)
    const savedName = localStorage.getItem(NameInputGUI.STORAGE_KEY);
    if (savedName) {
      this.inputField.text = savedName;
    }

    // Handle enter key to submit
    this.inputField.onKeyboardEventProcessedObservable.add((evt) => {
      if (evt.key === 'Enter' && this.inputField.text.trim()) {
        this.handleConnect();
      }
    });

    stack.addControl(this.inputField);

    // Add error text (hidden by default)
    this.errorText = new TextBlock('errorText', '');
    this.errorText.fontFamily = 'system-ui, -apple-system, sans-serif';
    this.errorText.fontSize = 14;
    this.errorText.color = '#ff6b6b';
    this.errorText.height = '20px';
    this.errorText.isVisible = false;
    this.errorText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    stack.addControl(this.errorText);

    // Add connect button
    this.connectButton = Button.CreateSimpleButton('connectBtn', 'Connect');
    this.connectButton.width = '320px';
    this.connectButton.height = '50px';
    this.connectButton.color = 'white';
    this.connectButton.background = '#7A42F4';
    this.connectButton.cornerRadius = 15;
    this.connectButton.thickness = 0;
    this.connectButton.fontFamily = 'system-ui, -apple-system, sans-serif';
    this.connectButton.fontSize = 18;
    this.connectButton.fontWeight = '500';

    // Button hover effects
    this.connectButton.onPointerEnterObservable.add(() => {
      this.connectButton.background = '#8B5CF5';
    });
    this.connectButton.onPointerOutObservable.add(() => {
      this.connectButton.background = '#7A42F4';
    });

    // Button click handler
    this.connectButton.onPointerClickObservable.add(() => {
      this.handleConnect();
    });

    stack.addControl(this.connectButton);

    // Focus input field by default
    setTimeout(() => {
      this.inputField.focus();
    }, 100);
  }

  /**
   * Handle connect button click
   */
  private handleConnect(): void {
    // Disable button immediately to prevent double-clicking
    this.connectButton.isEnabled = false;

    const name = this.inputField.text.trim();

    if (!name) {
      this.showError('Please enter your email');
      this.connectButton.isEnabled = true; // Re-enable on validation error
      return;
    }

    if (name.length > 50) {
      this.showError('Email must be 50 characters or less');
      this.connectButton.isEnabled = true; // Re-enable on validation error
      return;
    }

    // Save username to localStorage for next time
    localStorage.setItem(NameInputGUI.STORAGE_KEY, name);

    // Clear error and trigger callback
    this.hideError();
    if (this.onConnectCallback) {
      this.onConnectCallback(name);
    }
    // Keep button disabled during connection attempt
    // It will be re-enabled by enableConnectButton() if connection fails
  }

  /**
   * Set callback for connect button
   */
  onConnect(callback: (name: string) => void): void {
    this.onConnectCallback = callback;
  }

  /**
   * Show error message and re-enable connect button
   */
  showError(message: string): void {
    this.errorText.text = message;
    this.errorText.isVisible = true;
    this.connectButton.isEnabled = true; // Re-enable button on error
  }

  /**
   * Hide error message
   */
  hideError(): void {
    this.errorText.isVisible = false;
    this.errorText.text = '';
  }

  /**
   * Show the name input GUI
   */
  show(): void {
    this.joinContainer.isVisible = true;
    this.isVisible = true;
    setTimeout(() => {
      this.inputField.focus();
    }, 100);
  }

  /**
   * Hide the join screen
   */
  hide(): void {
    this.joinContainer.isVisible = false;
    this.isVisible = false;
  }

  /**
   * Check if GUI is visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Check if sound is enabled (always returns true for minimalist UI)
   */
  isSoundEnabled(): boolean {
    return true;
  }

  /**
   * Dispose GUI resources
   */
  dispose(): void {
    this.texture.dispose();
  }
}
