import {describe,it,expect} from 'vitest';
import {parseText,parseLines,toTalusSections,reviewWarnings,mergeIntoMaster} from './importParser';
import {createMaster,validateMaster} from './model';
const sample=`Title: Science 10
Section 1: Foundations
1. Which formula is water? (1 mark)
A. H2O
B. CO2
C. O2
Answer: A
2. Explain why speed differs from velocity. (3 marks)
Answer: Velocity includes direction.
Section 2: Applications
3. Calculate acceleration. (2 marks)
Answer: 2 m/s²
4. Select chemical changes. (2 marks)
A. A precipitate forms
B. Ice melts
C. Gas forms after a reaction
Answer: A, C`;
describe('Milestone 2A deterministic import',()=>{
 it('detects sections, numbered questions, answer choices, correct keys and points',()=>{
  const d=parseText(sample);
  expect(d.title).toBe('Science 10');
  expect(d.sections).toHaveLength(2);
  expect(d.sections.map(s=>s.questions.length)).toEqual([2,2]);
  expect(d.sections[0].questions[0].choices).toHaveLength(3);
  expect(d.sections[0].questions[0].correct).toEqual([0]);
  expect(d.sections[0].questions[0].marks).toBe(1);
  expect(d.sections[0].questions[1].type).toBe('writtenResponse');
  expect(d.sections[1].questions[1].correct).toEqual([0,2]);
  expect(d.sections[1].questions[1].type).toBe('multipleSelect');
 });
 it('converts reviewed complete text to valid Talus section/question structure',()=>{
  const d=parseText(sample);
  const m=mergeIntoMaster(createMaster(),d,'replace');
  expect(m.sections).toHaveLength(2);
  expect(validateMaster(m)).toEqual([]);
 });
 it('retains incomplete questions and flags missing keys without inventing answers',()=>{
  const d=parseText('1. Choose the option\nA. Yes\nB. No');
  expect(d.sections[0].questions[0].correct).toEqual([]);
  expect(reviewWarnings(d).join(' ')).toContain('Correct answer not identified');
 });
 it('does not override manually reviewed question types',()=>{
  const d=parseText(sample);d.sections[0].questions[0].type='multipleSelect';
  reviewWarnings(d);
  expect(d.sections[0].questions[0].type).toBe('multipleSelect');
 });
 it('appends rather than replaces the active assessment when chosen',()=>{
  const m=createMaster(),d=parseText(sample);const result=mergeIntoMaster(m,d,'append');
  expect(result.sections).toHaveLength(3);
  expect(result.title).toBe(m.title);
  expect(result.lastGeneration).toBeUndefined();
 });
 it('preserves inline HTML spans in imported lines',()=>{
  const lines=[
   {number:1,text:'1. Chemical formula?',html:'1. Chemical formula?'},
   {number:2,text:'A. H2O',html:'A. H<sub>2</sub>O'},
   {number:3,text:'B. CO2',html:'B. CO<sub>2</sub>'},
   {number:4,text:'Answer: A',html:'Answer: A'}
  ];
  const d=parseLines(lines);
  const q=d.sections[0].questions[0];expect(q.choices[0]).toContain('<sub>2</sub>');
  const converted=toTalusSections(d);expect(converted[0].items).toHaveLength(1);
 });
});
