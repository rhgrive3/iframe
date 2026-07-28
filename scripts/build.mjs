import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const sourcePath = new URL('../src/autoclicker.js', import.meta.url);
const outputPath = new URL('../a.js', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const payload = gzipSync(Buffer.from(source), { level: 9 }).toString('base64');
const chunks = payload.match(/.{1,120}/g) ?? [];
const encoded = chunks.map((chunk, index) =>
  `${index === 0 ? '    ' : '    + '}\'${chunk}\'`
).join('\n');

const wrapper = `(() => {\n  'use strict';\n  // Generated from src/autoclicker.js. Run: node scripts/build.mjs\n  const payload =\n${encoded};\n\n  (async () => {\n    if (typeof DecompressionStream !== 'function') {\n      throw new Error('このSafariはDecompressionStreamに対応していません。');\n    }\n    const bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0));\n    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));\n    const source = await new Response(stream).text();\n    (0, eval)(source + '\\n//# sourceURL=iframe-autoclicker-v7.js');\n  })().catch(error => {\n    console.error('[Iframe AutoClicker] 起動失敗', error);\n    if (typeof completion === 'function') completion({ ok: false, error: String(error) });\n  });\n})();\n`;

writeFileSync(outputPath, wrapper);
console.log(`Built a.js: ${source.length} source bytes -> ${wrapper.length} wrapper bytes`);
