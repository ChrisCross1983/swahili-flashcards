# Testing

## Browser smoke tests

The Vitest suite covers most domain behavior. A small Playwright layer covers mobile/browser interaction risks that source guards cannot validate: overlays, scroll/focus cleanup, quick search editing, group picker positioning, duplicate confirmation layering, and trainer grading reachability.

Install Playwright when network access is available:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Run:

```bash
npm run test:e2e
```

The tests use the existing development login route and require one of these credential pairs:

```bash
SECURITY_TEST_EMAIL=...
SECURITY_TEST_PASSWORD=...
```

or:

```bash
PLAYWRIGHT_TEST_EMAIL=...
PLAYWRIGHT_TEST_PASSWORD=...
```

The smoke tests mock app API responses after login, so they do not create or delete real cards. They are intentionally not part of `npm run check` yet because local browser binaries and test credentials may be unavailable.
