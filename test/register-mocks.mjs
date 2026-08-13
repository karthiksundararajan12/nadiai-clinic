/**
 * Node built-in test runner equivalent of Jest moduleNameMapper /
 * Vitest resolve.alias for `server-only`.
 *
 * This repo uses `node --test` (no jest.config / vitest.config). Map the
 * bare specifier to test/mocks/server-only.js so unit tests can import
 * server-bound modules that start with `import "server-only"`.
 */
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MOCK = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "mocks", "server-only.js"),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { shortCircuit: true, url: MOCK };
    }
    return nextResolve(specifier, context);
  },
});
