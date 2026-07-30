# Pre-demo checklist

Run `node scripts/e2e-smoke-test.mjs` (defaults to prod; pass `--env=staging` when a staging URL is configured) against Deepti clinic **before every doctor-facing demo with Ravikiran** — it exercises booking → payment webhook → reminders → dashboard APIs and cleans up the test appointment afterward.
