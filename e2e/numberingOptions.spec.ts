import { expect, test } from '@playwright/test';
import { importAssessment, type Assessment, type Variant } from './fixtures';

const response = (id: string, stem: string, type: Variant['type']): Variant => ({
  id, stem: '<p>' + stem + '</p>', type, choices: [], correctChoiceIds: [],
  referenceAnswer: '<p>One</p>', points: 1, shuffleChoices: false,
});
const assessment: Assessment = {
  schemaVersion: 1, id: 'm8-numbering-options', title: 'Kite Club', instructions: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sections: [{
    id: 'launch', title: 'Launch field', proficiency: '', instructions: '', shuffleQuestions: false,
    items: [
      {kind:'slot',id:'tail',shufflePosition:false,variants:[response('tail-a','Count the kite tails.','shortAnswer')]},
      {kind:'slot',id:'wind',shufflePosition:false,variants:[{
        ...response('wind-a','Which direction is marked on the flag?','singleChoice'),
        choices:[{id:'north',html:'<p>North</p>'},{id:'south',html:'<p>South</p>'}],
        correctChoiceIds:['north'],
      }]},
      {kind:'slot',id:'safety',shufflePosition:false,variants:[response('safety-a','Describe one launch precaution.','writtenResponse')]},
    ],
  }],
};

test('choose Numerical response, separate labels, and saved continuous numbering', async ({page}) => {
  await page.goto('./');
  await importAssessment(page, assessment);
  await page.getByRole('combobox',{name:'Type',exact:true}).selectOption('numericalResponse');
  const numbering=page.getByRole('combobox',{name:'Question numbering',exact:true});
  await expect(numbering).toHaveValue('byType');
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  const labels=page.locator('.question-stem > strong');
  await expect(labels).toHaveText(['NR1.','1.','WR1.']);
  await page.getByRole('button',{name:'1. Author'}).click();
  await numbering.selectOption('continuous');
  await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
  await expect(labels).toHaveText(['NR1.','1.','WR1.']);
  await page.getByRole('button',{name:'1. Author'}).click();
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await expect(labels).toHaveText(['1.','2.','3.']);
  await page.reload();
  await expect(numbering).toHaveValue('continuous');
  await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
  await expect(labels).toHaveText(['1.','2.','3.']);
});
