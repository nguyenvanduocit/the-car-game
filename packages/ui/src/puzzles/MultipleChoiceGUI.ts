import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Button,
  Control,
  StackPanel,
  Image,
} from '@babylonjs/gui';

/**
 * MultipleChoiceGUI - Multiple choice question puzzle with refined modern UI
 * Player selects one of 4 answers
 */
export class MultipleChoiceGUI {
  private advancedTexture: AdvancedDynamicTexture;
  private container: Rectangle;
  private question: string;
  private choices: string[];
  private correctIndex: number;

  private onComplete: ((success: boolean, answerIndex: number) => void) | null = null;
  private onClose: (() => void) | null = null;

  constructor(
    advancedTexture: AdvancedDynamicTexture,
    question: string,
    choices: string[],
    correctIndex: number
  ) {
    this.advancedTexture = advancedTexture;
    this.question = question;
    this.choices = choices;
    this.correctIndex = correctIndex;

    // Check if this is an image question to adjust container height
    const isImageQuestion = this.question.endsWith('.webp');

    // Create container with refined modern style
    this.container = new Rectangle('multipleChoiceContainer');
    this.container.width = '700px';
    if (isImageQuestion) {
      this.container.height = '720px';
    } else {
      this.container.adaptHeightToChildren = true;
      this.container.paddingTop = '15px';
      this.container.paddingBottom = '25px';
    }
    this.container.background = 'rgba(15, 15, 25, 0.98)';
    this.container.thickness = 3;
    this.container.color = 'rgba(100, 200, 255, 0.6)';
    this.container.cornerRadius = 20;

    // Subtle glow
    this.container.shadowBlur = 30;
    this.container.shadowOffsetX = 0;
    this.container.shadowOffsetY = 0;
    this.container.shadowColor = 'rgba(100, 200, 255, 0.4)';

    this.advancedTexture.addControl(this.container);

    // Create UI
    this.createUI();
  }

  /**
   * Create puzzle UI with refined modern style
   */
  private createUI(): void {
    // Close button - absolute positioned at top right
    const closeButton = Button.CreateSimpleButton('closeButton', '✕');
    closeButton.fontFamily = 'Arial, Helvetica, sans-serif';
    closeButton.width = '45px';
    closeButton.height = '45px';
    closeButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    closeButton.top = '15px';
    closeButton.left = '-15px';
    closeButton.fontSize = 24;
    closeButton.fontWeight = '600';
    closeButton.color = 'rgba(255, 180, 180, 0.7)';
    closeButton.background = 'rgba(80, 60, 70, 0.3)';
    closeButton.thickness = 2;
    closeButton.cornerRadius = 10;

    closeButton.onPointerEnterObservable.add(() => {
      closeButton.background = 'rgba(200, 80, 100, 0.6)';
      closeButton.color = 'rgba(255, 255, 255, 0.95)';
      closeButton.thickness = 3;
    });

    closeButton.onPointerOutObservable.add(() => {
      closeButton.background = 'rgba(80, 60, 70, 0.3)';
      closeButton.color = 'rgba(255, 180, 180, 0.7)';
      closeButton.thickness = 2;
    });

    closeButton.onPointerClickObservable.add(() => {
      if (this.onClose) {
        this.onClose();
      }
    });

    this.container.addControl(closeButton);

    // Main stack panel with proper padding
    const stackPanel = new StackPanel('mainStack');
    stackPanel.width = '620px';
    stackPanel.paddingTop = '25px';
    stackPanel.paddingBottom = '25px';
    this.container.addControl(stackPanel);

    // Question - either image or text based on the question value
    const isImageQuestion = this.question.endsWith('.webp');

    if (isImageQuestion) {
      // Image question - use absolute URL for production compatibility
      const baseUrl = import.meta.env.PROD ? 'https://firegame.firegroup.vn' : '';
      const questionImage = new Image('questionImage', `${baseUrl}/questions/${this.question}`);
      questionImage.width = '580px';
      questionImage.height = '300px';
      questionImage.stretch = Image.STRETCH_UNIFORM;
      stackPanel.addControl(questionImage);
    } else {
      // Text question - clean and readable
      const questionText = new TextBlock('question', this.question);
      questionText.fontFamily = 'Arial, Helvetica, sans-serif';
      questionText.fontSize = 22;
      questionText.color = 'rgba(200, 220, 255, 0.95)';
      questionText.fontWeight = '600';
      questionText.textWrapping = true;
      questionText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      questionText.resizeToFit = true;
      questionText.lineSpacing = '5px';
      stackPanel.addControl(questionText);
    }

    // Spacer
    const spacer1 = new Rectangle('spacer1');
    spacer1.height = '25px';
    spacer1.thickness = 0;
    stackPanel.addControl(spacer1);

    // Choice buttons with consistent styling
    this.choices.forEach((choice, index) => {
      const button = Button.CreateSimpleButton(`choice_${index}`, choice);
      button.fontFamily = 'Arial, Helvetica, sans-serif';
      button.height = '60px';
      button.fontSize = 17;
      button.fontWeight = '500';
      button.color = 'rgba(255, 255, 255, 0.9)';
      button.background = 'rgba(60, 80, 120, 0.4)';
      button.thickness = 2;
      button.cornerRadius = 12;

      button.onPointerEnterObservable.add(() => {
        button.background = 'rgba(100, 150, 220, 0.6)';
        button.thickness = 3;
      });

      button.onPointerOutObservable.add(() => {
        button.background = 'rgba(60, 80, 120, 0.4)';
        button.thickness = 2;
      });

      button.onPointerClickObservable.add(() => this.handleChoice(index, button));

      stackPanel.addControl(button);

      // Consistent spacing between buttons
      if (index < this.choices.length - 1) {
        const buttonSpacer = new Rectangle(`spacer_${index}`);
        buttonSpacer.height = '14px';
        buttonSpacer.thickness = 0;
        stackPanel.addControl(buttonSpacer);
      }
    });
  }

  /**
   * Handle choice selection with clear feedback
   */
  private handleChoice(index: number, button: Button): void {
    const isCorrect = index === this.correctIndex;

    if (isCorrect) {
      // Correct answer - clean green
      button.background = 'rgba(80, 200, 120, 0.8)';
      button.color = 'rgba(255, 255, 255, 0.95)';
      button.fontWeight = '700';
      button.thickness = 3;
      console.log('[MULTIPLE_CHOICE] Correct answer selected!');

      // Complete puzzle after brief delay
      setTimeout(() => this.complete(true, index), 800);
    } else {
      // Wrong answer - clean red
      button.background = 'rgba(220, 80, 100, 0.8)';
      button.color = 'rgba(255, 255, 255, 0.95)';
      button.fontWeight = '700';
      button.thickness = 3;
      console.log('[MULTIPLE_CHOICE] Wrong answer selected');

      // Fail puzzle after brief delay
      setTimeout(() => this.complete(false, index), 800);
    }
  }

  /**
   * Complete puzzle
   */
  private complete(success: boolean, answerIndex: number): void {
    if (this.onComplete) {
      this.onComplete(success, answerIndex);
    }
  }

  /**
   * Set completion callback
   * Callback receives: success (local validation) and answerIndex (for server validation)
   */
  setOnComplete(callback: (success: boolean, answerIndex: number) => void): void {
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
