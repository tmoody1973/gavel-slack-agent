// One-time bootstrap: opens the persistent profile so Tarik can log into Slack web by hand.
// Re-run any time to verify the session still holds.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const PROFILE = fileURLToPath(new URL('../.browser-profile', import.meta.url));
const GENERAL = 'https://app.slack.com/client/T0B8KS540G4/C0B8KS5VCCC';

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1920, height: 1080 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(GENERAL);
console.log('Log into Slack in the window (choose "use Slack in your browser" if prompted).');
console.log('When #general is visible, press Enter here.');
await new Promise((resolve) => process.stdin.once('data', resolve));
const composer = page.locator('[data-qa="message_input"]').first();
console.log(
  (await composer.isVisible())
    ? '✅ logged in — composer visible'
    : '❌ composer NOT visible — selectors need adjusting before capture',
);
await ctx.close();
process.exit(0);
