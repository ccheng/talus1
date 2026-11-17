import { z } from 'zod';
import type { GeneratedVersion } from './generate';
import { slotsOf, type MasterTest } from './model';
import { receiptFileSchema, sha256 } from './wordReceiptFiles';

export { sha256 };

const questionSchema = z.object({
  sectionNumber: z.number().int().positive(),
  sectionTitle: z.string(),
  sourceQuestion: z.number().int().positive(),
  wordQuestion: z.number().int().nonnegative().optional(),
  generatedNumber: z.number().int().positive(),
  alternative: z.number().int().positive(),
  choices: z.array(z.object({source:z.string().length(1),generated:z.string().length(1),correct:z.boolean()})),
});
const versionReceiptSchema = z.object({
  format: z.literal('talus-version-receipt'),
  schemaVersion: z.literal(1),
  assessmentTitle: z.string(),
  runId: z.string().min(1),
  version: z.string().min(1),
  questions: z.array(questionSchema).min(1),
  files: z.array(receiptFileSchema).max(2),
});
export type VersionReceipt = z.infer<typeof versionReceiptSchema>;

export function buildVersionReceipt(master: MasterTest, version: GeneratedVersion): VersionReceipt {
  const run = master.lastGeneration;
  if (!run || run.sourceUpdatedAt !== master.updatedAt) throw Error('Generate versions before downloading a receipt.');
  const authored = new Map(master.sections.flatMap((section, sectionIndex) =>
    slotsOf(section).map((slot, slotIndex) => [slot.id, {
      slot, sectionNumber:sectionIndex+1, sectionTitle:section.title, sourceQuestion:slotIndex+1,
    }] as const)
  ));

  const questions = version.sections.flatMap(section => section.questions.map(question => {
    const origin = authored.get(question.slotId);
    const alternativeIndex = origin?.slot.variants.findIndex(variant => variant.id === question.variantId) ?? -1;
    if (!origin || alternativeIndex < 0) throw Error('A generated question does not match the reviewed assessment.');
    const variant = origin.slot.variants[alternativeIndex];
    const choices = variant.choices.map((choice, index) => {
      const generatedIndex = question.choices.findIndex(candidate => candidate.id === choice.id);
      if (generatedIndex < 0) throw Error('A generated choice does not match the reviewed assessment.');
      return {
        source:String.fromCharCode(65+index),
        generated:String.fromCharCode(65+generatedIndex),
        correct:question.correctChoiceIds.includes(choice.id),
      };
    });
    return {
      sectionNumber:origin.sectionNumber,
      sectionTitle:origin.sectionTitle,
      sourceQuestion:origin.sourceQuestion,
      wordQuestion:master.wordQuestionNumbers?.[variant.id],
      generatedNumber:question.number,
      alternative:alternativeIndex+1,
      choices,
    };
  }));
  const saved = master.wordReceiptFiles;
  return {
    format:'talus-version-receipt',
    schemaVersion:1,
    assessmentTitle:master.title,
    runId:run.runId,
    version:version.label,
    questions,
    files:saved?.runId === run.runId && saved.sourceUpdatedAt === master.updatedAt
      ? saved.versions[version.label] ?? [] : [],
  };
}

export function readVersionReceipt(content: string): VersionReceipt {
  const result = versionReceiptSchema.parse(JSON.parse(content));
  const roles = new Set(result.files.map(file => file.role));
  if (roles.size !== result.files.length || result.files.some(file => !file.filename.toLowerCase().endsWith('.docx'))) {
    throw Error('Invalid receipt file records.');
  }
  return result;
}

export async function verifyReceiptFile(receipt: VersionReceipt, bytes: Uint8Array) {
  const digest = await sha256(bytes);
  return receipt.files.filter(file => file.sha256 === digest);
}
