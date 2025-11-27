import questionsData from '../data/questions.json';

/**
 * Question data structure (v2.0.0 - simplified, no difficulty)
 * Question ID is integer (0-399) matching tile frameSlotIndex
 */
export interface Question {
  id: number;
  question: string;
  choices: string[];
  correctIndex: number;
}

/**
 * QuestionBank - Centralized question repository
 * Used by both server (validation) and client (display)
 *
 * V2.0.0 Changes:
 * - Question ID is now integer (not string)
 * - Direct 1:1 mapping: questionId === frameSlotIndex
 * - No difficulty levels (removed random selection)
 * - Exactly 400 questions (one per tile)
 */
export class QuestionBank {
  private static questions = new Map<number, Question>();
  private static initialized = false;

  /**
   * Initialize question bank (call once on startup)
   */
  static initialize(): void {
    if (this.initialized) return;

    // Load all questions into map (id is integer)
    for (const q of questionsData.questions) {
      this.questions.set(q.id, q as Question);
    }

    this.initialized = true;
    console.log(`[QuestionBank] Initialized with ${this.questions.size} questions`);
  }

  /**
   * Get question by ID (integer)
   * Returns undefined if not found
   */
  static get(id: number): Question | undefined {
    if (!this.initialized) this.initialize();
    return this.questions.get(id);
  }

  /**
   * Validate answer for a question
   * Used by server for authoritative validation
   */
  static validateAnswer(questionId: number, answerIndex: number): boolean {
    if (!this.initialized) this.initialize();
    const question = this.questions.get(questionId);

    if (!question) {
      console.error(`[QuestionBank] Question not found: ${questionId}`);
      return false;
    }

    return question.correctIndex === answerIndex;
  }

  /**
   * Get total question count
   */
  static getCount(): number {
    if (!this.initialized) this.initialize();
    return this.questions.size;
  }
}
