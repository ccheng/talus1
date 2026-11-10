import {describe,it,expect} from 'vitest';
import {parseText,mergeIntoMaster} from './importParser';
import {createMaster,sectionHeading,validateMaster} from './model';
import {embeddedAssetWarnings} from './media';

describe('2C.1 independent acceptance corrective regression units',()=>{
 it('persists a Word conversion linked-image diagnostic into validation and backup structure',()=>{
  const imported=parseText('Section 1: Foundations\n1. Read the calibration patch.\nAnswer: Calibration verified.');
  imported.warnings.push("Word conversion: could not open external image: 'https://example.com/talus-2c1-test-image.png'");
  const master=mergeIntoMaster(createMaster(),imported,'replace');
  expect(master.importWarnings?.join(' ')).toContain('could not open external image');
  expect(validateMaster(master).join(' ')).toContain('Unresolved imported source warnings');
  expect(JSON.parse(JSON.stringify(master)).importWarnings).toEqual(master.importWarnings);
 });
 it('persists an explicit media-loss downgrade error when source is intentionally reparsed as text',()=>{
  const imported=parseText('Section 1: Foundations\n1. Which card?\nAnswer: Card 1');
  imported.warnings.push('Rich-content source media loss: embedded images and tables were discarded.');
  const master=mergeIntoMaster(createMaster(),imported,'replace');
  expect(validateMaster(master).join(' ')).toContain('Unresolved imported source warnings');
 });
 it('does not duplicate trailing proficiency labels in preview or Markdown',()=>{
  expect(sectionHeading('Section 1: Foundations (Base)','Base')).toBe('Section 1: Foundations (Base)');
  expect(sectionHeading('Section 1: Foundations (Base)','Base','markdown')).toBe('Section 1: Foundations (Base)');
  expect(sectionHeading('Section 2: Applications','Proficient')).toBe('Section 2: Applications — Proficient');
  expect(sectionHeading('Section 2: Applications','Proficient','markdown')).toBe('Section 2: Applications (Proficient)');
 });
 it('still rejects external image references in JSON-imported questions',()=>{
  expect(embeddedAssetWarnings('<img src="https://example.com/chart.png">')).toHaveLength(1);
 });
});