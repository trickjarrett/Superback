import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

await build({
  entryPoints: ['src/background.js'],
  outfile: 'extension/background.js',
  bundle: true,
  format: 'iife',
  target: 'firefox140',
  legalComments: 'inline',
});
await copyFile('node_modules/tldts/LICENSE', 'extension/THIRD-PARTY-LICENSE.txt');
console.log('Built extension/background.js with local Public Suffix List data.');
