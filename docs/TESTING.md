# Testing

## Unit tests

Fast, no network — session machine, transcript policy, transcription queue, services.

```bash
npm run test:unit
```

## E2E tests (Playwright)

### Smoke (default CI)

Unauthenticated UI + API checks. No credentials required.

```bash
npm run test:e2e
```

### Full AI Scribe pipeline

Covers: new consultation → audio upload → transcription → transcript review → SOAP generation → SOAP approval → prescription generation → prescription approval.

**Prerequisites**

1. Supabase test doctor with **email + password** auth (not Google-only).
2. Env vars in `.env.local` (or export before run):

```bash
E2E_TEST_EMAIL=doctor@example.com
E2E_TEST_PASSWORD=your-password
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
DEEPGRAM_API_KEY=...
GEMINI_API_KEY=...          # or OPENAI_API_KEY + SOAP_AI_PROVIDER=openai
```

3. Migrations `002`–`011` applied on the project.
4. Download audio fixture (once):

```bash
npm run e2e:fixtures
```

**Run**

```bash
npm run test:e2e:full
```

Uses `e2e/helpers/scribe-api.js` for reliable upload/transcription and UI for review/approve steps. Typical runtime: 5–10 minutes (AI calls).

### All tests

```bash
npm run test:all          # unit + smoke
npm run test:e2e:full     # + full scribe (when creds configured)
```

### Debugging

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e:full   # use existing dev server
npx playwright show-report
```

## CI

`.github/workflows/test.yml` runs unit tests and Playwright smoke on every PR. Full pipeline is intended for nightly or manual workflow with secrets.

## Test IDs

Stable selectors for E2E:

| Test ID | Location |
|---------|----------|
| `scribe-workflow` | Main scribe panel |
| `consultation-row` | Active consultation row |
| `review-transcript` | Open transcript review |
| `scribe-complete-review` | Finish transcript review |
| `scribe-generate-soap` | Generate SOAP |
| `soap-approve` | Approve SOAP |
| `prescription-generate` | Generate Rx draft |
| `prescription-review-open` | Open Rx review |
| `prescription-approve` | Approve Rx |
