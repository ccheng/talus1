import {describe,it,expect} from 'vitest';
import {parseText,parseLines,toTalusSections,reviewWarnings,mergeIntoMaster,wordConversionWarnings} from './importParser';
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

describe('Milestone 2.1 acceptance evidence regressions',()=>{
 it('P0 preserves malformed A/B multiple-choice lines and blocks an unmatched D answer key',()=>{
  const source='Section 1: Applications\n1. Which object has the highest speed?\nA. A cart moving at 2 m/s\nB.\nAnswer: D';
  const draft=parseText(source);
  const q=draft.sections[0].questions[0];
  expect(q.type).toBe('singleChoice');
  expect(q.choices).toHaveLength(2);
  expect(q.choices[0]).toContain('A cart moving at 2 m/s');
  expect(q.choices[1]).toBe('');
  expect(q.answer).toBe('');
  expect(q.correct).toEqual([]);
  expect(reviewWarnings(draft).join(' ')).toMatch(/blank answer choice/i);
  expect(reviewWarnings(draft).join(' ')).toMatch(/does not match the detected answer choices/i);
  const master=mergeIntoMaster(createMaster(),draft,'replace');
  expect(validateMaster(master).join(' ')).toMatch(/unresolved import review|blank/i);
 });
 it('P1 maps a separate numbered answer-key section without adding student questions',()=>{
  const source=[
   'Science 10 Motion Assessment',
   'Show your work and include SI units.',
   'Section 1: Foundations (Base)',
   '1. Which SI unit measures acceleration?',
   'A. m','B. s','C. m/s²','D. m/s',
   '2. A cart travels 12 m in 3 s. Calculate its average speed.',
   'Section 2: Applications (Proficient)',
   '3. What does the area under a velocity-time graph represent?',
   'A. Acceleration','B. Displacement','C. Time','D. Force',
   'Section 3: Transfer (Exemplary)',
   '4. A runner travels 12 m east then 6 m west. Calculate displacement.',
   'Answer Key','1. C','2. 4 m/s','3. B','4. 6 m east'
  ];
  const lines=source.map((text,i)=>({text,html:text,number:i+1}));
  const draft=parseLines(lines,'motion','docx');
  expect(draft.title).toBe('Science 10 Motion Assessment');
  expect(draft.instructions).toContain('Show your work');
  expect(draft.sections).toHaveLength(3);
  const questions=draft.sections.flatMap(s=>s.questions);
  expect(questions).toHaveLength(4);
  expect(questions[0].choices).toHaveLength(4);
  expect(questions[2].choices).toHaveLength(4);
  expect(questions.map(q=>q.correct)).toEqual([[2],[],[1],[]]);
  expect(questions[1].answer).toBe('4 m/s');
  expect(questions[3].answer).toBe('6 m east');
  expect(reviewWarnings(draft)).toEqual([]);
  expect(validateMaster(mergeIntoMaster(createMaster(),draft,'replace'))).toEqual([]);
 });
 it('P1 parses compact chemistry Markdown line boundaries without losing questions or keys',()=>{
  const source=[
   '# Science 10 Chemical Reactions','Read every question and show all work.',
   '## Section 1: Foundations (Base)',
   '1. Which formula represents water?',
   'A. H<sub>2</sub>O','B. CO<sub>2</sub>','C. O<sub>2</sub>','D. NaCl','Answer: A',
   '2. State the charge of the ion Mg<sup>2+</sup>. Explain why.',
   '- Refer to electrons.','- Use the sign in your answer.',
   'Answer: Positive two. Magnesium has lost two electrons.',
   '## Section 2: Applications (Proficient)',
   '3. In the closed flask, what is the total mass after the reaction?',
   'A. 80 g','B. 100 g','C. 120 g','D. Cannot be determined','Answer: B'
  ].join('\n');
  const draft=parseText(source);
  expect(draft.title).toBe('Science 10 Chemical Reactions');
  expect(draft.sections.map(s=>s.questions.length)).toEqual([2,1]);
  expect(draft.sections[0].questions[0].correct).toEqual([0]);
  expect(draft.sections[1].questions[0].correct).toEqual([1]);
  expect(draft.sections[0].questions[1].answer).toContain('Positive two');
  expect(draft.sections[0].questions[1].stem).toContain('<ul>');
  expect(draft.sections[0].questions[1].stem).not.toContain('Answer:');
  expect(validateMaster(mergeIntoMaster(createMaster(),draft,'replace'))).toEqual([]);
 });
 it('P2 strips numbering from fully emphasized Word questions and recognizes Q4 prefixes',()=>{
  const lines=[
   {text:'Section 1: Proficient',html:'Section 1: Proficient',number:1},
   {text:'12) Explain why mass and weight differ.',html:'<em>12) Explain why mass and weight differ.</em>',number:2},
   {text:'Answer: Mass is constant while weight depends on gravity.',html:'Answer: Mass is constant while weight depends on gravity.',number:3},
   {text:'Q4. Explain how velocity can be negative.',html:'Q4. Explain how velocity can be negative.',number:4},
   {text:'Answer: Velocity includes direction.',html:'Answer: Velocity includes direction.',number:5}
  ];
  const questions=parseLines(lines).sections[0].questions;
  expect(questions).toHaveLength(2);
  expect(questions[0].stem).toBe('<em>Explain why mass and weight differ.</em>');
  expect(questions[1].stem).not.toMatch(/Q4/);
 });
 it('blocks ambiguous duplicate numbered answer-key mappings rather than guessing',()=>{
  const draft=parseText('Section 1: A\n1. First question\n2. Other question\n1. Repeated number\nAnswer Key\n1. B');
  expect(draft.warnings.join(' ')).toContain('could not be matched uniquely');
  expect(validateMaster(mergeIntoMaster(createMaster(),draft,'replace')).join(' ')).toContain('Unresolved imported source warnings');
 });
});

describe('Word Title-style diagnostic regression',()=>{
 const draft=()=>parseLines([
  {text:'Science 10 Unit Test',html:'Science 10 Unit Test',number:1},
  {text:'Section 1: Foundations',html:'Section 1: Foundations',number:2},
  {text:'1. Name the compound.',html:'1. Name the compound.',number:3},
  {text:'Answer: H2O',html:'Answer: H2O',number:4}
 ],'science10','docx');
 it('suppresses only a Title-style warning when the first paragraph became the assessment title',()=>{
  const parsed=draft();
  expect(parsed.title).toBe('Science 10 Unit Test');
  expect(wordConversionWarnings([
   {message:"Unrecognised paragraph style: 'Title' (Style ID: Title)"},
   {message:"Unrecognised paragraph style: 'null' (Style ID: Title)"},
   {message:"Paragraph style with ID Title was referenced but not defined in the document"},
   {message:"Unrecognised paragraph style: 'Custom Note' (Style ID: MyNote)"},
   {message:"An image could not be converted"}
  ],parsed)).toEqual([
   "Word conversion: Unrecognised paragraph style: 'Custom Note' (Style ID: MyNote)",
   "Word conversion: An image could not be converted"
  ]);
 });
 it('retains Title warning if title recognition did not succeed',()=>{
  const parsed=draft();parsed.title='science10';
  expect(wordConversionWarnings([{message:"Unrecognised paragraph style: 'Title' (Style ID: Title)"}],parsed)).toHaveLength(1);
 });
});
