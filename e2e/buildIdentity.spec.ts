import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the header identifies the release and deployed commit', async ({ page }) => {
  await page.goto('./');
  const shortCommit = process.env.GITHUB_SHA?.slice(0, 7);
  const expected = 'v' + version + ' · ' + (shortCommit ? 'build ' + shortCommit : 'local build');
  await expect(page.locator('header .brand')).toContainText(expected);
});
