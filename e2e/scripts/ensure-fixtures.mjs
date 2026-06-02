/**
 * Downloads a short speech WAV used by Scribe E2E upload/transcription tests.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, "../fixtures/consultation-sample.wav");
const SOURCE =
  "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";

async function main() {
  try {
    await access(target);
    console.log("E2E fixture already present:", target);
    return;
  } catch {
    // download
  }

  await mkdir(dirname(target), { recursive: true });
  console.log("Downloading consultation audio fixture…");
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buf);
  console.log("Wrote", target, `(${buf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
