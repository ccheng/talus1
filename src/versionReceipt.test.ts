import { expect, it } from 'vitest';
import { generateVersions, generationRecord, restoreGenerated } from './generate';
import { mergeIntoMaster, parseLines, textLines } from './importParser';
import { createMaster, createSlot, createVariant, masterSchema, slotsOf } from './model';
import { buildVersionReceipt, readVersionReceipt, sha256, verifyReceiptFile } from './versionReceipt';

it('traces shuffled group children and the selected alternative through the reviewed order', async () => {
  const draft = parseLines(textLines('Section A: Lab\n7. Alpha\nA. One\nB. Two\nAnswer: B\n9. Beta\nA. Gas\nB. Ice\nAnswer: A'), 'Receipt fixture', 'docx');
  const master = mergeIntoMaster(createMaster(), draft, 'replace');
  const section = master.sections[0];
  const [first, second] = slotsOf(section);
  const alternative = createVariant('multipleSelect');
  alternative.stem = '<p>Pick two</p>';
  alternative.choices.forEach((choice, index) => { choice.html = '<p>Option '+index+'</p>'; });
  alternative.correctChoiceIds = [alternative.choices[0].id, alternative.choices[2].id];
  first.variants.push(alternative);
  section.items = [{kind:'group',id:'g',sharedHtml:'<p>Read the setup.</p>',shuffleWithinGroup:true,items:[first,second]}];
  const other = createSlot();
  other.variants = [{...createVariant('writtenResponse'), stem:'<p>Explain.</p>', referenceAnswer:'<p>Evidence</p>'}];
  master.sections.push({...section,id:'second',title:'Explain',items:[other]});
  const versions = generateVersions(master, 2, 'receipt-review');
  master.lastGeneration = generationRecord(master, versions, 2, 'receipt-review');
  const restored = masterSchema.parse(JSON.parse(JSON.stringify(master)));
  expect(restoreGenerated(restored)).toEqual(versions);
  for (const version of versions) {
    const receipt = buildVersionReceipt(restored, version);
    expect(receipt.questions.map(row => row.generatedNumber)).toEqual([1,2,3]);
    const row = receipt.questions.find(entry => entry.sourceQuestion === 1 && entry.sectionNumber === 1)!;
    const question = version.sections[0].questions.find(question => question.slotId === first.id)!;
    const source = first.variants.find(variant => variant.id === question.variantId)!;
    expect(row.alternative).toBe(first.variants.indexOf(source)+1);
    expect(row.wordQuestion).toBe(source === alternative ? undefined : 7);
    expect(row.choices).toEqual(source.choices.map((choice, index) => ({
      source: String.fromCharCode(65+index),
      generated: String.fromCharCode(65+question.choices.findIndex(other => other.id === choice.id)),
      correct: source.correctChoiceIds.includes(choice.id)
    })));
    expect(receipt.questions[2]).toMatchObject({sectionNumber:2,sourceQuestion:1,generatedNumber:3,choices:[]});
  }
});

it('matches renamed original bytes and distinguishes malformed receipts and altered files', async () => {
  const bytes = new TextEncoder().encode('abc');
  const sha = await sha256(bytes);
  expect(sha).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const file = { filename:'Version-A.docx', role:'student' as const, sha256:sha };
  const receipt = { format:'talus-version-receipt', schemaVersion:1, assessmentTitle:'Test', runId:'abc0000',
    version:'A', questions:[{sectionNumber:1,sectionTitle:'Section A',sourceQuestion:1,generatedNumber:1,alternative:1,choices:[]}], files:[file] };
  const loaded = readVersionReceipt(JSON.stringify(receipt));
  expect(await verifyReceiptFile(loaded, bytes)).toEqual([file]);
  expect(await verifyReceiptFile(loaded, new TextEncoder().encode('changed'))).toEqual([]);
  expect(() => readVersionReceipt(JSON.stringify({...receipt, files:[{...file,sha256:'wrong'}]}))).toThrow();
  expect(() => readVersionReceipt(JSON.stringify({generation:receipt}))).toThrow();
});
