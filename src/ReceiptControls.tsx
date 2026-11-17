import { useState } from 'react';
import type { GeneratedVersion } from './generate';
import type { MasterTest } from './model';
import { download, fileBase } from './storage';
import { buildVersionReceipt, readVersionReceipt, verifyReceiptFile } from './versionReceipt';

export function ReceiptDownloads({master, version, exporting}:{
  master:MasterTest;
  version:GeneratedVersion;
  exporting:boolean;
}) {
  const [pdfBusy,setPdfBusy] = useState(false);
  const [status,setStatus] = useState('');
  const fileCount = master.wordReceiptFiles?.runId === master.lastGeneration?.runId
    && master.wordReceiptFiles?.sourceUpdatedAt === master.updatedAt
    ? master.wordReceiptFiles?.versions[version.label]?.length ?? 0 : 0;

  async function downloadReceipt(format:'json'|'pdf') {
    setStatus('');
    try {
      const receipt = buildVersionReceipt(master,version);
      const filename = fileBase(master)+'-V'+version.label+'-run-'+receipt.runId+'-teacher-receipt.'+format;
      if (format==='json') {
        download(JSON.stringify(receipt,null,2),filename,'application/json');
        return;
      }
      setPdfBusy(true);
      const { downloadReceiptPdf } = await import('./receiptPdf');
      await downloadReceiptPdf(receipt,filename);
    } catch {
      setStatus('Could not download the receipt. Try again.');
    } finally {
      setPdfBusy(false);
    }
  }
  return <section className="panel receipt-controls">
    <h2>Version {version.label} receipt</h2>
    <p className="help">Teacher copy — contains correct answers. The receipt maps the reviewed assessment to this version.</p>
    <p className="help">{fileCount===0
      ? 'Export a Word file first to include its fingerprint in the JSON receipt.'
      : 'The JSON receipt includes the most recent Word export for each recorded file type.'}</p>
    <div className="export-actions">
      <button className="secondary" disabled={pdfBusy} onClick={()=>void downloadReceipt('pdf')}>Download receipt (PDF)</button>
      <button className="secondary" disabled={exporting} onClick={()=>void downloadReceipt('json')}>Download receipt (JSON)</button>
    </div>
    {status&&<p role="alert">{status}</p>}
  </section>;
}

export function ReceiptVerifier() {
  const [receipt,setReceipt] = useState<File>();
  const [word,setWord] = useState<File>();
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);

  async function verify() {
    if (!receipt||!word) return;
    setBusy(true);
    setStatus('');
    try {
      let parsed;
      try {
        parsed = readVersionReceipt(await receipt.text());
      } catch {
        setStatus('Invalid Talus receipt. Choose a downloaded Version receipt (JSON).');
        return;
      }
      const identity = 'Version '+parsed.version+' · Run '+parsed.runId;
      if (!parsed.files.length) {
        setStatus(identity+' — This receipt has no Word fingerprints. Use the JSON receipt saved after exporting Word.');
        return;
      }
      const matches = await verifyReceiptFile(parsed,new Uint8Array(await word.arrayBuffer()));
      setStatus(matches.length
        ? identity+' — Exact export match: '+matches.map(file=>file.filename+' ('+(file.role==='student'?'student form':'answer key')+')').join(', ')+'.'
        : identity+' — No match. This file differs from the recorded Word exports for this version.');
    } catch {
      setStatus('Could not verify the file. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <details className="panel receipt-controls">
    <summary>Verify a Word export</summary>
    <p className="help">Select a JSON receipt you kept and a Word document. Talus compares them on this device.</p>
    <div className="columns">
      <label>Receipt JSON<input type="file" accept=".json,application/json" disabled={busy}
        onChange={event=>{setReceipt(event.target.files?.[0]);setStatus('');}}/></label>
      <label>Word document<input type="file" accept=".docx" disabled={busy}
        onChange={event=>{setWord(event.target.files?.[0]);setStatus('');}}/></label>
    </div>
    <button type="button" className="secondary" disabled={!receipt||!word||busy} onClick={()=>void verify()}>Verify file</button>
    {status&&<p role="status">{status}</p>}
  </details>;
}
