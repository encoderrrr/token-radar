// Token Radar's entrypoint. It reads the sealed snapshot, scores it with the radar-2 model, and
// writes the board, the dashboard's data and the dossier: everything the gate checks.
//
// Usage: node --experimental-strip-types main.ts --input snapshot.json --output /output
// Contract: main.ts --input <path> | MAKEFUN_OUTPUT_DIR
// The program runs twice and writes identical bytes on both runs; it reads no network, no file
// outside its input, and takes no key. Everything it writes is derived from the snapshot alone,
// so the second run is a byte-for-byte copy of the first.

import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildRadar, parseSnapshot, boardIssue, dataScript } from './lib/model.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** The run's options: --input <path>, --output <dir> (or MAKEFUN_OUTPUT_DIR). */
function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--input' && argv[i + 1] !== undefined) input = argv[++i]!;
    else if (a === '--output' && argv[i + 1] !== undefined) output = argv[++i]!;
  }
  if (!input) throw new Error('missing --input <snapshot.json>');
  if (!output) throw new Error('missing --output <dir> (or MAKEFUN_OUTPUT_DIR)');
  return { input, output };
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv.slice(2));
  const outDir = resolve(output);
  await mkdir(join(outDir, 'dashboard'), { recursive: true });

  const snapshot = parseSnapshot(await readFile(resolve(input), 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`board is not one the gate takes: ${issue}`);

  // board.json: the ranked board, the gate's first file.
  await writeFile(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');
  // data.js: the dashboard's whole dataset, written beside the dashboard that reads it.
  await writeFile(join(outDir, 'dashboard', 'data.js'), dataScript(radar), 'utf8');
  // The dashboard itself: a page, a stylesheet and a script, copied from the committed source.
  for (const file of ['index.html', 'app.css', 'app.js']) {
    await cp(join(here, 'dashboard', file), join(outDir, 'dashboard', file));
  }
  // The screenshots: the three dashboard views, committed with the entry and copied with it,
  // so the dossier is built from exactly the images the entry ships.
  await mkdir(join(outDir, 'screenshots'), { recursive: true });
  const shotFiles = (await readdir(join(here, 'screenshots')))
    .filter((f) => /\.(?:png|jpe?g)$/i.test(f))
    .sort();
  for (const file of shotFiles) {
    await cp(join(here, 'screenshots', file), join(outDir, 'screenshots', file));
  }
  // dossier.json: the gate's proof, byte-for-byte what buildDossier writes.
  const dossier = await buildDossier(outDir, { text_max_bytes: 65_536 });
  await writeFile(join(outDir, 'dossier.json'), dossier, 'utf8');
  const screenshots = (await readdir(join(outDir, 'screenshots')).catch(() => []))
    .filter((f) => /\.(?:png|jpe?g)$/i.test(f))
    .sort();
  if (screenshots.length < 3) {
    throw new Error(`the dashboard needs 3 screenshots, found ${screenshots.length}`);
  }
  console.log(JSON.stringify({
    board_rows: board.length,
    watchlist_rows: radar.watchlist_size,
    early_rows: radar.early_size,
    live_rows: radar.live_size,
    screenshots: screenshots.length,
    dossier_bytes: Buffer.byteLength(dossier, 'utf8'),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
