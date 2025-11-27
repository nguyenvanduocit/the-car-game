#!/usr/bin/env bun
/**
 * Script to generate 400 placeholder questions for BlockGame
 * Usage: bun run scripts/generate-questions.ts
 */

import { existsSync } from 'fs';
import { join } from 'path';

const QUESTIONS_PATH = join(import.meta.dir, '../packages/shared/src/data/questions.json');
const TOTAL_QUESTIONS = 400;

// Placeholder question templates
const templates = [
  { q: "Câu hỏi {id}: 2 + 2 = ?", choices: ["3", "4", "5", "6"], correct: 1 },
  { q: "Câu hỏi {id}: Thủ đô của Việt Nam?", choices: ["Hà Nội", "TP.HCM", "Đà Nẵng", "Huế"], correct: 0 },
  { q: "Câu hỏi {id}: Màu của bầu trời?", choices: ["Đỏ", "Xanh", "Vàng", "Trắng"], correct: 1 },
  { q: "Câu hỏi {id}: 1 tuần có bao nhiêu ngày?", choices: ["5", "6", "7", "8"], correct: 2 },
  { q: "Câu hỏi {id}: 10 - 3 = ?", choices: ["6", "7", "8", "9"], correct: 1 },
  { q: "Câu hỏi {id}: Con vật nào kêu 'gâu gâu'?", choices: ["Mèo", "Chó", "Bò", "Chim"], correct: 1 },
  { q: "Câu hỏi {id}: Mặt trời mọc hướng nào?", choices: ["Đông", "Tây", "Nam", "Bắc"], correct: 0 },
  { q: "Câu hỏi {id}: 5 × 2 = ?", choices: ["8", "9", "10", "11"], correct: 2 },
  { q: "Câu hỏi {id}: Tháng 1 có bao nhiêu ngày?", choices: ["28", "30", "31", "32"], correct: 2 },
  { q: "Câu hỏi {id}: Màu của lá cây?", choices: ["Đỏ", "Xanh lá", "Vàng", "Đen"], correct: 1 },
];

async function generateQuestions() {
  console.log('🔨 Generating 400 questions...');

  // Check if file exists
  if (!existsSync(QUESTIONS_PATH)) {
    console.error(`❌ File not found: ${QUESTIONS_PATH}`);
    process.exit(1);
  }

  // Read existing questions
  const fileContent = await Bun.file(QUESTIONS_PATH).text();
  const data = JSON.parse(fileContent);

  const existingQuestions = data.questions || [];
  console.log(`📖 Found ${existingQuestions.length} existing questions`);

  // Create map of existing IDs
  const existingIds = new Set(existingQuestions.map((q: any) => q.id));
  console.log(`✓ Existing IDs: ${existingIds.size} (${Math.min(...existingIds)} - ${Math.max(...existingIds)})`);

  // Generate missing questions
  const allQuestions = [...existingQuestions];
  let generated = 0;

  for (let id = 0; id < TOTAL_QUESTIONS; id++) {
    if (!existingIds.has(id)) {
      // Use template (cycle through templates)
      const template = templates[id % templates.length];

      allQuestions.push({
        id: id,
        question: template.q.replace('{id}', id.toString()),
        choices: [...template.choices],
        correctIndex: template.correct
      });
      generated++;
    }
  }

  // Sort by ID
  allQuestions.sort((a, b) => a.id - b.id);

  // Verify we have exactly 400 questions
  if (allQuestions.length !== TOTAL_QUESTIONS) {
    console.error(`❌ Expected ${TOTAL_QUESTIONS} questions, got ${allQuestions.length}`);
    process.exit(1);
  }

  // Check for duplicates
  const idSet = new Set(allQuestions.map(q => q.id));
  if (idSet.size !== TOTAL_QUESTIONS) {
    console.error(`❌ Duplicate IDs found! Unique IDs: ${idSet.size}, Expected: ${TOTAL_QUESTIONS}`);
    process.exit(1);
  }

  // Save to file
  const output = {
    version: "2.0.0",
    questions: allQuestions
  };

  await Bun.write(QUESTIONS_PATH, JSON.stringify(output, null, 2) + '\n');

  console.log(`✅ Generated ${generated} new questions`);
  console.log(`✅ Total questions: ${allQuestions.length}`);
  console.log(`✅ Saved to: ${QUESTIONS_PATH}`);
  console.log('');
  console.log('📊 Summary:');
  console.log(`   - Existing: ${existingQuestions.length}`);
  console.log(`   - Generated: ${generated}`);
  console.log(`   - Total: ${allQuestions.length}`);
}

// Run
generateQuestions().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
