import { PuzzleType, MultipleChoiceData, QuestionBank } from '@blockgame/shared';
import { PuzzleConfigSchema } from '../schema/PuzzleConfigSchema';

/**
 * Generate puzzle for tiles using fillCount-based mapping
 * Two-puzzle system: each tile needs two puzzles to complete
 * fillCount=0 → first puzzle, questionId = frameSlotIndex (0-399)
 * fillCount=1 → second puzzle, questionId = frameSlotIndex + 400 (400-799)
 */
export class PuzzleGenerator {
  // Number of tiles (slots) in the game
  private static readonly TILE_COUNT = 400;

  /**
   * Generate puzzle configuration for a tile
   * @param frameSlotIndex - The slot index (0-399)
   * @param fillCount - The current fill count (0=first puzzle, 1=second puzzle)
   */
  static generatePuzzle(frameSlotIndex: number, fillCount: number = 0): PuzzleConfigSchema {
    // fillCount-based mapping:
    // fillCount=0: first puzzle, questions 0-399
    // fillCount=1: second puzzle, questions 400-799
    const questionId = frameSlotIndex + fillCount * this.TILE_COUNT;

    // Get question from bank
    const question = QuestionBank.get(questionId);

    if (!question) {
      throw new Error(
        `[PuzzleGenerator] Question not found for tile ${frameSlotIndex} (fillCount: ${fillCount}). ` +
        `Ensure questions.json contains question with id=${questionId}`
      );
    }

    // Create puzzle with question ID (optimized - no full data in state)
    // Pass empty data object as placeholder (data field kept for backwards compatibility)
    const emptyData: MultipleChoiceData = {
      question: '',
      choices: [],
      correctIndex: 0,
    };

    // Use difficulty=1 as default (field kept for backwards compatibility)
    // Convert questionId to string for schema storage
    return new PuzzleConfigSchema(PuzzleType.MULTIPLE_CHOICE, 1, emptyData, 0, 0, questionId.toString());
  }

}
