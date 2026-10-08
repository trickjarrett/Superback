import { createServer } from 'node:http';
import { mkdtemp, cp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { firefox } from 'playwright';

const { values } = parseArgs({ options: { firefox: { type: 'string' } } });
const binary = values.firefox || process.env.FIREFOX_BINARY || firefox.executablePath();
try { await access(binary); } catch {
  throw new Error('Firefox not found. Run npx playwright install firefox, or set FIREFOX_BINARY.');
}
let submit;
const result = new Promise((resolve) => { submit = resolve; });
const server = createServer(async (request, response) => {
  if (request.url === '/results' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try { submit(JSON.parse(body)); } catch { submit([{ name: 'results', passed: false, error: body }]); }
    response.end('ok');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'max-age=60' });
  response.end('<!doctype html><title>Super Back fixture</title><script>addEventListener("pageshow", event => { window.restoredFromCache = event.persisted; });</script><h1>History fixture</h1><a href="/next">Next</a>');
});
server.listen(0, '0.0.0.0');
await once(server, 'listening');
const base = `http://localhost:${server.address().port}`;
const directory = await mkdtemp(join(tmpdir(), 'superback-test-'));
let child;
let deadline;
let logs = '';
try {
  await cp('extension', directory, { recursive: true });
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  // Extra permissions exist in this disposable test copy only.
  manifest.permissions.push('scripting');
  manifest.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*'];
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await build({
    entryPoints: ['tests/browser-driver.js'], outfile: join(directory, 'background.js'),
    bundle: true, format: 'iife', target: 'firefox140',
    define: { 'globalThis.TEST_BASE': JSON.stringify(base) },
  });
  child = spawn(process.execPath, [
    'node_modules/web-ext/bin/web-ext.js', 'run', '--source-dir', directory,
    '--firefox', binary, '--arg=-headless', '--no-reload', '--no-input', '--no-config-discovery',
  ], { env: { ...process.env, NO_UPDATE_NOTIFIER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  const exited = new Promise((_, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Firefox runner exited (${code})\n${logs}`)));
  });
  const timeout = new Promise((_, reject) => {
    deadline = setTimeout(() => reject(new Error(`Firefox tests timed out\n${logs}`)), 90_000);
  });
  const results = await Promise.race([result, exited, timeout]);
  for (const item of results) {
    console.log(`${item.skipped ? 'SKIP' : item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.reason ? ` — ${item.reason}` : ''}${item.error ? `\n${item.error}` : ''}`);
  }
  if (results.some((item) => !item.passed && !item.skipped)) process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (child && child.exitCode === null) {
    child.kill('SIGINT');
    await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
