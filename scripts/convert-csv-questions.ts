#!/usr/bin/env bun
/**
 * Script to convert questions from CSV to JSON format
 * Usage: bun run scripts/convert-csv-questions.ts
 */

import { join } from 'path';

const CSV_PATH = join(import.meta.dir, '../packages/shared/src/data/question.csv');
const JSON_PATH = join(import.meta.dir, '../packages/shared/src/data/questions.json');

interface Question {
  id: number;
  question: string;
  choices: string[];
  correctIndex: number;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function letterToIndex(letter: string): number {
  const map: Record<string, number> = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
  return map[letter.toUpperCase()] ?? 0;
}

async function convertCSVToJSON() {
  console.log('Reading CSV file...');
  const csvContent = await Bun.file(CSV_PATH).text();

  // Split into lines, handling multiline fields
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (const char of csvContent) {
    if (char === '"') {
      inQuotes = !inQuotes;
    }

    if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  console.log(`Found ${lines.length} lines in CSV`);

  // Skip header row
  const dataLines = lines.slice(1);

  const questions: Question[] = [];
  const seenQuestions = new Set<string>();

  for (const line of dataLines) {
    const cols = parseCSVLine(line);

    // Expected: [number, question, A, B, C, D, correct_letter]
    if (cols.length < 7) {
      console.warn(`Skipping line with ${cols.length} columns: ${line.substring(0, 50)}...`);
      continue;
    }

    const [_num, questionText, choiceA, choiceB, choiceC, choiceD, correctLetter] = cols;

    // Skip empty questions
    if (!questionText || !questionText.trim()) {
      continue;
    }

    // Skip duplicates
    const questionKey = questionText.trim().toLowerCase();
    if (seenQuestions.has(questionKey)) {
      continue;
    }
    seenQuestions.add(questionKey);

    const question: Question = {
      id: questions.length,
      question: questionText.trim(),
      choices: [
        choiceA?.trim() || '',
        choiceB?.trim() || '',
        choiceC?.trim() || '',
        choiceD?.trim() || ''
      ],
      correctIndex: letterToIndex(correctLetter?.trim() || 'A')
    };

    questions.push(question);
  }

  console.log(`Parsed ${questions.length} unique questions`);

  // Write to JSON
  const output = {
    version: '2.0.0',
    questions
  };

  await Bun.write(JSON_PATH, JSON.stringify(output, null, 2) + '\n');

  console.log(`Wrote ${questions.length} questions to ${JSON_PATH}`);
}

convertCSVToJSON().catch(console.error);
