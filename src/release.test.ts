import { describe,expect,it } from 'vitest';
import { unzipSync,strFromU8 } from 'fflate';
import { createMaster,createVariant,markLabel,responseLineCount } from './model';
import { generateVersions,generationRecord } from './generate';
import { bundleFiles,bundleZip,versionMarkdown } from './export';

function fixture(){
 const m=createMaster();m.title='Regression';
 const s=m.sections[0];s.items=[];
 const v=createVariant('writtenResponse');v.stem='<p>Explain</p>';v.referenceAnswer='<p>Example</p>';v.points=4;v.responseLines=9;
 s.items.push({kind:'slot',id:'written-1',shufflePosition:true,variants:[v]});
 return m;
}
describe('Milestone 1.1 exports',()=>{
 it('creates one ZIP with every student version and answer key and a manifest',()=>{
  const m=fixture();const versions=generateVersions(m,6,'same-seed');
  m.lastGeneration=generationRecord(m,versions,6,'same-seed');
  const files=bundleFiles(m,versions),archive=unzipSync(bundleZip(m,versions));
  expect(Object.keys(files)).toHaveLength(13);
  expect(Object.keys(archive).sort()).toEqual(Object.keys(files).sort());
  for(const [filename,bytes] of Object.entries(files)) expect(strFromU8(archive[filename])).toEqual(strFromU8(bytes));
  expect(strFromU8(archive['generation-manifest.json'])).toContain(m.lastGeneration.runId);
 });
 it('uses matching response lines and correct singular or plural mark labels',()=>{
  const m=fixture();const [v]=generateVersions(m,1,'test');
  const markdown=versionMarkdown(m,v);
  expect((markdown.match(/\\_\\_/g)||[]).length).toBe(9*10);
  expect(markdown).toContain('(4 marks)');
  expect(markLabel(1)).toBe('1 mark');
  expect(markLabel(2)).toBe('2 marks');
  expect(responseLineCount('shortAnswer')).toBe(2);
  expect(responseLineCount('writtenResponse')).toBe(8);
 });
 it('loads old v1 JSON without response lines or generation settings',()=>{
  const m=fixture();delete m.generationSettings;
  const item=m.sections[0].items[0];if(item.kind!=='slot')throw Error();
  delete item.variants[0].responseLines;
  expect(responseLineCount(item.variants[0].type,item.variants[0].responseLines)).toBe(8);
 });
});
