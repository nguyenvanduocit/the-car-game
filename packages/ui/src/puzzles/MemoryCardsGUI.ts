import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Button,
  Control,
  Grid,
} from '@babylonjs/gui';

/**
 * MemoryCardsGUI - Memory card matching puzzle
 * Player must match pairs of cards by remembering their positions
 */
export class MemoryCardsGUI {
  private advancedTexture: AdvancedDynamicTexture;
  private container: Rectangle;
  private grid: Grid;
  private cards: { index: number; value: number; revealed: boolean }[] = [];
  private cardButtons: Button[] = [];
  private revealedIndices: number[] = [];
  private matchedPairs: Set<number> = new Set();
  private isProcessing: boolean = false;
  private totalPairs: number = 0;

  private onComplete: ((success: boolean) => void) | null = null;
  private onClose: (() => void) | null = null;

  constructor(advancedTexture: AdvancedDynamicTexture, cardData: number[]) {
    this.advancedTexture = advancedTexture;
    this.totalPairs = cardData.length / 2;

    // Create container
    this.container = new Rectangle('memoryCardsContainer');
    this.container.width = '600px';
    this.container.height = '650px';
    this.container.background = 'rgba(0, 0, 0, 0.9)';
    this.container.thickness = 3;
    this.container.color = '#00ff00';
    this.container.cornerRadius = 10;
    this.advancedTexture.addControl(this.container);

    // Title
    const title = new TextBlock('memoryCardsTitle', 'MEMORY CARDS - Match Pairs');
    title.fontFamily = 'Arial, Helvetica, sans-serif';
    title.height = '60px';
    title.top = '20px';
    title.fontSize = 24;
    title.color = '#00ff00';
    title.fontWeight = 'bold';
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(title);

    // Initialize cards
    this.initializeCards(cardData);

    // Create grid
    this.grid = new Grid('memoryCardsGrid');
    this.grid.width = '560px';
    this.grid.height = '480px';
    this.grid.top = '80px';
    this.grid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    // Setup grid layout (4x4 for 16 cards)
    const rows = 4;
    const cols = 4;

    for (let i = 0; i < rows; i++) {
      this.grid.addRowDefinition(1 / rows);
    }
    for (let i = 0; i < cols; i++) {
      this.grid.addColumnDefinition(1 / cols);
    }

    this.container.addControl(this.grid);

    // Create card buttons
    this.createCardButtons(rows, cols);

    // Close button
    const closeButton = Button.CreateSimpleButton('closeButton', 'Close');
    closeButton.fontFamily = 'Arial, Helvetica, sans-serif';
    closeButton.width = '200px';
    closeButton.height = '50px';
    closeButton.fontSize = 20;
    closeButton.color = '#ffffff';
    closeButton.background = '#cc0000';
    closeButton.thickness = 2;
    closeButton.cornerRadius = 5;
    closeButton.top = '285px';
    closeButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    closeButton.onPointerClickObservable.add(() => {
      if (this.onClose) {
        this.onClose();
      }
    });
    this.container.addControl(closeButton);
  }

  /**
   * Initialize card data with shuffled pairs
   */
  private initializeCards(cardData: number[]): void {
    this.cards = cardData.map((value, index) => ({
      index,
      value,
      revealed: false,
    }));
  }

  /**
   * Create clickable card buttons
   */
  private createCardButtons(rows: number, cols: number): void {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (index >= this.cards.length) break;

        const card = this.cards[index];
        const button = Button.CreateSimpleButton(`card_${index}`, '?');
        button.fontFamily = 'Arial, Helvetica, sans-serif';
        button.width = '120px';
        button.height = '100px';
        button.fontSize = 40;
        button.color = '#ffffff';
        button.background = '#333333';
        button.thickness = 2;
        button.cornerRadius = 5;

        button.onPointerClickObservable.add(() => this.handleCardClick(index));

        this.grid.addControl(button, row, col);
        this.cardButtons.push(button);
      }
    }
  }

  /**
   * Handle card click
   */
  private handleCardClick(index: number): void {
    // Don't process if already processing or card already revealed
    if (this.isProcessing) return;
    if (this.cards[index].revealed) return;
    if (this.matchedPairs.has(this.cards[index].value)) return;

    // Reveal card
    this.revealCard(index);
    this.revealedIndices.push(index);

    // Check if two cards are revealed
    if (this.revealedIndices.length === 2) {
      this.isProcessing = true;
      this.checkMatch();
    }
  }

  /**
   * Reveal a card by showing its value
   */
  private revealCard(index: number): void {
    const card = this.cards[index];
    const button = this.cardButtons[index];

    card.revealed = true;
    button.textBlock!.text = card.value.toString();
    button.background = '#0066cc';
  }

  /**
   * Hide a card
   */
  private hideCard(index: number): void {
    const card = this.cards[index];
    const button = this.cardButtons[index];

    card.revealed = false;
    button.textBlock!.text = '?';
    button.background = '#333333';
  }

  /**
   * Check if revealed cards match
   */
  private checkMatch(): void {
    const [index1, index2] = this.revealedIndices;
    const card1 = this.cards[index1];
    const card2 = this.cards[index2];

    setTimeout(() => {
      if (card1.value === card2.value) {
        // Match found
        this.matchedPairs.add(card1.value);
        this.cardButtons[index1].background = '#00aa00';
        this.cardButtons[index2].background = '#00aa00';

        console.log(`[MEMORY] Match found: ${card1.value}, Pairs: ${this.matchedPairs.size}/${this.totalPairs}`);

        // Check if all pairs matched
        if (this.matchedPairs.size === this.totalPairs) {
          setTimeout(() => this.complete(true), 500);
        }
      } else {
        // No match - hide cards
        this.hideCard(index1);
        this.hideCard(index2);
      }

      // Reset for next turn
      this.revealedIndices = [];
      this.isProcessing = false;
    }, 1000);
  }

  /**
   * Complete puzzle
   */
  private complete(success: boolean): void {
    if (this.onComplete) {
      this.onComplete(success);
    }
  }

  /**
   * Set completion callback
   */
  setOnComplete(callback: (success: boolean) => void): void {
    this.onComplete = callback;
  }

  /**
   * Set close callback (called when user clicks Close button)
   */
  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  /**
   * Show puzzle
   */
  show(): void {
    this.container.isVisible = true;
  }

  /**
   * Hide puzzle
   */
  hide(): void {
    this.container.isVisible = false;
  }

  /**
   * Dispose puzzle GUI
   */
  dispose(): void {
    this.advancedTexture.removeControl(this.container);
    this.container.dispose();
  }
}
