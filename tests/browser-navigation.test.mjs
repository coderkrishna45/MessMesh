import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const appUrl = process.env.TEST_HTTP_BASE_URL;
const enabled = process.env.TEST_BROWSER === 'true' && Boolean(appUrl);

test(
  'Admin can navigate across pages while dashboard keeps its explicit landing redirect',
  { skip: !enabled },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const session = {
        user: {
          id: 'browser-test-admin',
          name: 'Fictional Browser Admin',
          email: 'browser-admin@example.invalid',
          role: 'ADMIN',
          wing: 'ALL',
          cleanPlateScore: 0,
        },
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };

      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const response =
          path === '/api/auth/session'
            ? session
            : path === '/api/admin/simulate-date'
              ? { success: true, date: '2026-11-14', dayOfWeekName: 'Saturday' }
              : path === '/api/leaderboard'
                ? { success: true, wingLeaderboard: [], studentLeaderboard: [] }
                : path === '/api/vote/weekly-contest'
                  ? { success: true, weeks: [] }
                  : path === '/api/vote'
                    ? { success: true, menu: [], dayOfWeek: 'Saturday' }
                    : { success: true };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response),
        });
      });

      await page.goto(new URL('/leaderboard', appUrl).toString());
      const wardensButton = page.getByRole('button', { name: 'Wardens' }).first();
      await wardensButton.waitFor();
      await page.waitForTimeout(500);
      assert.equal(new URL(page.url()).pathname, '/leaderboard');

      await wardensButton.click();
      await page.waitForURL((url) => url.pathname === '/admin/wardens');
      assert.equal(new URL(page.url()).pathname, '/admin/wardens');

      await page.goto(new URL('/dashboard', appUrl).toString());
      await page.waitForURL((url) => url.pathname === '/admin');
      assert.equal(new URL(page.url()).pathname, '/admin');
    } finally {
      await browser.close();
    }
  }
);
