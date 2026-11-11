import {describe,it,expect} from 'vitest';
import {equationIntegrityWarnings} from './equationSafety';
import {tableIntegrityWarnings,stripExecutableHtml} from './contentIntegrity';
import {createMaster,validateMaster} from './model';

describe('2C.3 independent acceptance hard safety gates',()=>{
 it('rejects rootless fractions that would silently flatten as 192',()=>{
  expect(equationIntegrityWarnings('<mfrac><mn>19</mn><mn>2</mn></mfrac>').join(' ')).toMatch(/Unrooted MathML/);
  expect(equationIntegrityWarnings('<math><mfrac><mn>19</mn><mn>2</mn></mfrac></math>')).toEqual([]);
 });
 it('rejects broken advanced table spans without rejecting ordinary merged geometry',()=>{
  expect(tableIntegrityWarnings('<table><tr><td rowspan="99" colspan="0">X</td></tr></table>').join(' ')).toMatch(/Invalid table geometry/);
  expect(tableIntegrityWarnings('<table><tr><td colspan="2">X</td></tr><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>')).toEqual([]);
 });
 it('removes entire script bodies and inline event handlers before saving or export',()=>{
  const bad='<p onmouseover="window.qa=1">safe</p><script>document.body.setAttribute("data-x","1")</script>';
  const safe=stripExecutableHtml(bad);
  expect(safe).toContain('safe');
  expect(safe).not.toMatch(/onmouseover|document\.body|<script/i);
 });
 it('content-level guards remain effective when warning metadata is cleared',()=>{
  const m=createMaster();
  const first=m.sections[0].items[0];
  if(first.kind!=='slot')throw Error('Expected slot');
  first.variants[0]={...first.variants[0],type:'shortAnswer',choices:[],correctChoiceIds:[],stem:'<p>Calculate <mfrac><mn>19</mn><mn>2</mn></mfrac></p>',referenceAnswer:'<p>9.5</p>'};
  m.importWarnings=[];
  expect(validateMaster(m).join(' ')).toMatch(/Unrooted MathML/);
  first.variants[0].stem='<p>Calculate <math><mfrac><mn>19</mn><mn>2</mn></mfrac></math></p>';
  expect(validateMaster(m)).toEqual([]);
 });
 it('invalid table geometry persists as a blocker after JSON backup restore',()=>{
  const m=createMaster();
  const first=m.sections[0].items[0];
  if(first.kind!=='slot')throw Error('Expected slot');
  first.variants[0]={...first.variants[0],type:'shortAnswer',choices:[],correctChoiceIds:[],stem:'<p>Read this grid</p><table><tr><td rowspan="99">Bad</td></tr></table>',referenceAnswer:'<p>Answer</p>'};
  const restored=JSON.parse(JSON.stringify(m));
  expect(validateMaster(restored).join(' ')).toMatch(/Invalid table geometry/);
 });
});