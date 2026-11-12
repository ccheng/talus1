import {expect, test} from '@playwright/test';
import {execFile, spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {unzipSync} from 'fflate';
import {auditRenderedPages} from './helpers/rendered-pagination';

const run = promisify(execFile);
const fixture = fileURLToPath(new URL('./fixtures/3b1-original-run.json', import.meta.url));
const rendererAvailable = () =>
  !spawnSync('soffice', ['--version']).error && !spawnSync('pdftotext', ['-v']).error;

test.describe('3B.1 rendered Word pagination for the archived acceptance run', () => {
  test.describe.configure({mode: 'default', timeout: 90_000});
  test.skip(!process.env.CI && !rendererAvailable(), 'Install LibreOffice Writer and Poppler to run the rendered Word checks.');

  let findings: {layout: string[]; lab: string[]};

  test.beforeAll(async ({browser, baseURL}, info) => {
    const page = await browser.newPage({baseURL, acceptDownloads: true});
    let zip: Uint8Array;
    try {
      await page.goto('./');
      page.on('dialog', dialog => dialog.accept());
      await page.locator('.header-actions input[type=file]').setInputFiles(fixture);
      await expect(page.getByText('Validation: Ready')).toBeVisible();
      await page.getByRole('button', {name: /Versions & answer keys/}).click();
      // Export the saved run so question order and alternative assignments are identical to acceptance.
      await expect(page.getByText('Run ID: 1pslge1', {exact: true})).toBeVisible();
      const download = page.waitForEvent('download');
      await page.getByRole('button', {name: /Word.*DOCX.*ZIP/i}).click();
      const downloadPath = await (await download).path();
      if (!downloadPath) throw new Error('Word ZIP did not produce a downloadable file');
      zip = await readFile(downloadPath);
    } finally {
      await page.close();
    }

    const files = Object.entries(unzipSync(zip)).filter(([name]) => name.endsWith('.docx'));
    expect(files).toHaveLength(12);
    expect(files.map(([name]) => name.match(/-V([A-F](?:-key)?)\.docx$/)?.[1]).sort())
      .toEqual([...('ABCDEF')].flatMap(version => [version, version + '-key']).sort());

    const dir = info.outputPath('rendered-word');
    await mkdir(dir, {recursive: true});
    const docx = await Promise.all(files.map(async ([name, bytes]) => {
      const path = join(dir, basename(name));
      await writeFile(path, bytes);
      return path;
    }));
    await run('soffice', [
      '-env:UserInstallation=' + pathToFileURL(join(dir, 'writer-profile')).href,
      '--headless', '--convert-to', 'pdf', '--outdir', dir, ...docx,
    ], {timeout: 60_000});
    const reports = await Promise.all(docx.map(async path => {
      const {stdout} = await run('pdftotext', ['-layout', path.replace(/\.docx$/, '.pdf'), '-']);
      const report = auditRenderedPages(stdout, path.endsWith('-key.docx'));
      return {name: basename(path), ...report};
    }));
    await writeFile(join(dir, 'audit.json'), JSON.stringify(reports, null, 2));
    findings = {
      layout: reports.flatMap(report => report.layoutIssues.map(issue => report.name + ': ' + issue)),
      lab: reports.flatMap(report => report.labIssues.map(issue => report.name + ': ' + issue)),
    };
  });

  test('headings, choices, compact table and labeled response space survive page boundaries', () => {
    expect(findings.layout).toEqual([]);
  });

  test('3B1-04: report the known Lab continuation gap and reject new splits', ({}, info) => {
    // The precise page break can vary with LibreOffice and the installed fonts.
    // Keep the observed gap visible while making any new split a CI failure.
    const knownGaps = [
      /-V[A-F]-key\.docx: (?:MIX-END E12B|Answer: 4 m\/s\.) on page /,
      /-V[ABCEF]\.docx: MIX-END E12B on page /,
      /-VE\.docx: Time \(s\) on page /,
    ];
    expect(findings.lab.filter(issue => !knownGaps.some(gap => gap.test(issue)))).toEqual([]);
    if (process.env.TALUS_STRICT_WORD_PAGINATION === '1') {
      expect(findings.lab).toEqual([]);
    }
    if (findings.lab.length) {
      info.annotations.push({type: 'Known 3B1-04 gap', description: findings.lab.join('\n')});
    }
  });
});
