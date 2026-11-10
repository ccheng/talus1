import {describe,it,expect} from 'vitest';
import {embeddedAssetWarnings,MAX_IMAGE_BYTES,MAX_TOTAL_IMAGE_BYTES} from './media';
import {createMaster,hasQuestionContent,validateMaster} from './model';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/OZkAAAAASUVORK5CYII=';
describe('2C.1 portable document media',()=>{
 it('allows an embedded PNG but rejects external/unsafe URLs and overly large images',()=>{
  expect(embeddedAssetWarnings('<p><img src="'+png+'"></p>')).toEqual([]);
  expect(embeddedAssetWarnings('<img src="https://example.com/chart.png">')).toContain('Image is not a supported embedded raster data URI.');
  expect(embeddedAssetWarnings('<img src="javascript:alert(1)">')).toHaveLength(1);
  expect(embeddedAssetWarnings('<img src="data:image/svg+xml;base64,AAAA">')).toHaveLength(1);
  expect(embeddedAssetWarnings('<img src="data:image/png;base64,'+'A'.repeat(1_500_000)+'">')).toContain('Image exceeds the 1 MiB limit.');
 });
 it('retains media-only question content and tests image references on JSON restore',()=>{
  expect(hasQuestionContent('<p><img src="'+png+'"></p>')).toBe(true);
  expect(hasQuestionContent('<table><tr><td></td></tr></table>')).toBe(true);
  const m=createMaster();
  const slot=m.sections[0].items[0];
  if(slot.kind!=='slot')throw Error('expected question slot');
  const q=slot.variants[0];
  q.type='shortAnswer';q.choices=[];q.correctChoiceIds=[];
  q.stem='<p>Interpret the diagram</p><img src="https://example.com/external.png">';
  q.referenceAnswer='<p>Example solution</p>';
  expect(validateMaster(m).join(' ')).toContain('Image is not a supported embedded raster data URI.');
  q.stem='<p>Interpret the diagram</p><img src="'+png+'">';
  expect(validateMaster(m)).toEqual([]);
 });
 it('sets explicit portable image and browser-storage limits',()=>{
  expect(MAX_IMAGE_BYTES).toBe(1024*1024);
  expect(MAX_TOTAL_IMAGE_BYTES).toBe(2*1024*1024);
 });
});
