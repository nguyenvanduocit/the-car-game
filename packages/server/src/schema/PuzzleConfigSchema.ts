import { Schema, type } from '@colyseus/schema';
import type {
  PuzzleConfig,
  MultipleChoiceData,
  PatternMatchData,
  SlidingTileData,
  MemoryCardData,
  PuzzleDataPayload,
  PuzzleDataSerialized,
} from '@blockgame/shared';
import { PuzzleType } from '@blockgame/shared';

/**
 * Puzzle configuration schema
 * Implements PuzzleConfig interface from @blockgame/shared
 */
const DEFAULT_PUZZLE_DATA: PuzzleDataPayload = {
  sequence: [],
  sequenceLength: 0,
} as PatternMatchData;

export class PuzzleConfigSchema extends Schema implements PuzzleConfig {
  @type('string') type: PuzzleType = PuzzleType.PATTERN_MATCH;
  @type('number') difficulty: 1 | 2 | 3 = 1;
  @type('string') data: string = '{}'; // Stored as JSON string for flexibility (legacy, prefer questionId)
  @type('string') questionId?: string; // Question ID for multiple_choice (reduces state size)
  @type('number') timeLimit: number = 0;
  @type('number') maxAttempts: number = 0;

  constructor(
    type: PuzzleType = PuzzleType.PATTERN_MATCH,
    difficulty: 1 | 2 | 3 = 1,
    data: MultipleChoiceData | PatternMatchData | SlidingTileData | MemoryCardData = DEFAULT_PUZZLE_DATA,
    timeLimit: number = 0,
    maxAttempts: number = 0,
    questionId?: string
  ) {
    super();
    this.type = type;
    this.difficulty = difficulty;
    this.data = JSON.stringify(data);
    this.questionId = questionId;
    this.timeLimit = timeLimit;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Get parsed puzzle data
   */
  getParsedData(): PuzzleDataPayload {
    return JSON.parse(this.data);
  }

  /**
   * Set puzzle data (serializes to JSON)
   */
  setData(data: PuzzleDataPayload): void {
    this.data = JSON.stringify(data);
  }
}
