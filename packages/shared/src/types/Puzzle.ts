/**
 * Puzzle type enum - determines UI and validation logic
 */
export enum PuzzleType {
  /** Simple multiple choice question */
  MULTIPLE_CHOICE = 'multiple_choice',

  /** Simon Says pattern matching game */
  PATTERN_MATCH = 'pattern_match',

  /** 15-puzzle sliding tile game */
  SLIDING_TILE = 'sliding_tile',

  /** Memory card matching game */
  MEMORY_CARDS = 'memory_cards',
}

/**
 * Multiple Choice puzzle data
 * Player answers a simple question with 4 choices
 */
export interface MultipleChoiceData {
  /** Question text */
  question: string;

  /** Array of 4 possible answers */
  choices: string[];

  /** Index of correct answer (0-3) */
  correctIndex: number;
}

/**
 * Pattern Match puzzle data
 * Player must repeat a color sequence
 */
export interface PatternMatchData {
  /** Color sequence to repeat (hex color codes) */
  sequence: string[];

  /** Sequence length increases with difficulty */
  sequenceLength: number; // difficulty 1=3, 2=5, 3=7
}

/**
 * Sliding Tile puzzle data
 * Classic 15-puzzle with one empty slot
 */
export interface SlidingTileData {
  /** Grid size (3x3, 4x4, or 5x5) */
  gridSize: 3 | 4 | 5; // difficulty 1=3, 2=4, 3=5

  /** Initial tile positions (shuffled) */
  initialState: number[];

  /** Solution state (ordered 0-8, 0-15, or 0-24) */
  solutionState: number[];
}

/**
 * Memory Cards puzzle data
 * Match pairs of face-down cards
 */
export interface MemoryCardData {
  /** Number of card pairs to match */
  pairCount: number; // difficulty 1=4, 2=6, 3=8

  /** Card identifiers (each appears twice) */
  cardIds: string[];

  /** Card face images (URLs or emoji) */
  cardImages: string[];
}

/**
 * Combined puzzle data union used across puzzle types
 */
export type PuzzleDataPayload = MultipleChoiceData | PatternMatchData | SlidingTileData | MemoryCardData;

/**
 * Serialized puzzle data payload - schemas store JSON strings, helpers can parse back to payloads
 */
export type PuzzleDataSerialized = PuzzleDataPayload | string;

/**
 * Puzzle configuration - defines puzzle type and parameters
 * Assigned to each tile on game initialization (deterministic by tile ID)
 */
export interface PuzzleConfig {
  /** Puzzle type identifier */
  type: PuzzleType;

  /** Difficulty level (affects puzzle complexity) */
  difficulty: 1 | 2 | 3;

  /** Puzzle-specific configuration data (raw payload or serialized JSON) */
  data: PuzzleDataSerialized;

  /** Question ID reference (for multiple_choice puzzles) - reduces state size */
  questionId?: string;

  /** Time limit in seconds (0 = no limit) */
  timeLimit: number;

  /** Maximum allowed attempts before forced fail (0 = unlimited) */
  maxAttempts: number;
}

/**
 * Puzzle result - sent to server on completion
 * Server validates before granting tile ownership
 */
export interface PuzzleResult {
  /** Tile index (frame slot index 0-399) this result belongs to */
  tileIndex: number;

  /** Session ID of player who solved */
  sessionId: string;

  /** Success or failure */
  success: boolean;

  /** Time taken in seconds */
  timeTaken: number;

  /** Number of attempts made */
  attempts: number;

  /** Timestamp when result submitted (for validation) */
  submittedAt: number;
}
