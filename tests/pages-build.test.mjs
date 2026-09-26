import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPages } from '../scripts/build-pages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(t, files) {
  const directory = await mkdtemp(resolve(root, '.pages-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceDir = resolve(directory, 'source'), outputDir = resolve(directory, 'output');
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(dirname(resolve(sourceDir, file)), { recursive: true });
    await writeFile(resolve(sourceDir, file), contents);
  }
  return { sourceDir, outputDir };
}

test('Pages build versions the complete relative code graph and preserves static assets', async t => {
  const files = {
    'index.html': '<link rel="stylesheet" href="./style.css"><script type="module" src="./game.js"></script><img src="./textures/ball.jpg">',
    'game.js': "import { value } from './physics.js';\nimport './side.js';\nexport { value } from './physics.js';\nexport const scene = () => import('./scene.js?detail=high#preview');\nexport default value;",
    'physics.js': 'export const value = 1;',
    'side.js': 'export {};',
    'scene.js': "import { vector } from './vendor/three.module.js'; export default vector;",
    'vendor/three.module.js': "import {\n vector\n} from './three.core.js';\nexport { vector } from './three.core.js';",
    'vendor/three.core.js': 'export const vector = 1;',
    'style.css': "@import './menu.css';\n@import url('./theme.css');\n@font-face { src: url('./fonts/font.woff2') }\nbody { background: url('./textures/ball.jpg') }",
    'menu.css': 'body { color: white }',
    'theme.css': 'body { margin: 0 }',
    'fonts/font.woff2': Buffer.from([0, 255, 1]),
    'textures/ball.jpg': Buffer.from([255, 0, 12]),
  };
  const options = await fixture(t, files);
  const { version } = await buildPages(options);
  assert.match(version, /^[a-f0-9]{16}$/);
  for (const file of ['index.html', 'game.js', 'scene.js', 'vendor/three.module.js', 'style.css']) {
    const built = await readFile(resolve(options.outputDir, file), 'utf8');
    const refs = [...built.matchAll(/(['"])(\.\.?\/[^'"\s]+\.(?:js|css)(?:\?[^'"\s]*)?(?:#[^'"\s]*)?)\1/g)].map(match => match[2]);
    assert.ok(refs.length, `${file} has code references`);
    for (const ref of refs) {
      const url = new URL(ref, `https://example.test/CricSim/${file}`);
      assert.equal(url.searchParams.get('v'), version, `${file}: ${ref}`);
      assert.ok(url.pathname.startsWith('/CricSim/'), 'project-relative routing is preserved');
      await readFile(resolve(options.outputDir, url.pathname.slice('/CricSim/'.length)));
    }
  }
  const builtGame = await readFile(resolve(options.outputDir, 'game.js'), 'utf8');
  assert.ok(builtGame.includes(`./scene.js?detail=high&v=${version}#preview`));
  const styles = await readFile(resolve(options.outputDir, 'style.css'), 'utf8');
  assert.ok(styles.includes("url('./fonts/font.woff2')"));
  assert.ok(styles.includes("url('./textures/ball.jpg')"));
  for (const [file, contents] of Object.entries(files)) {
    assert.deepEqual(await readFile(resolve(options.sourceDir, file)), Buffer.from(contents), 'source stays unchanged');
  }
  for (const file of ['fonts/font.woff2', 'textures/ball.jpg']) {
    assert.deepEqual(await readFile(resolve(options.outputDir, file)), files[file]);
  }
});

test('a cached module graph cannot mix old dependencies with a new release', async t => {
  const options = await fixture(t, {
    'package.json': '{"type":"module"}',
    'index.html': '<script type="module" src="./game.js"></script>',
    'game.js': "export { value } from './physics.js'; export const lazy = () => import('./scene.js');",
    'physics.js': 'export const value = 1;',
    'scene.js': "export { value } from './physics.js';",
  });
  const first = await buildPages(options);
  const moduleUrl = version => `${pathToFileURL(resolve(options.outputDir, 'game.js'))}?v=${version}`;
  const previous = await import(moduleUrl(first.version));
  assert.equal(previous.value, 1);
  assert.equal((await previous.lazy()).value, 1);

  await writeFile(resolve(options.sourceDir, 'physics.js'), 'export const value = 2;');
  const second = await buildPages(options);
  assert.notEqual(second.version, first.version);
  const current = await import(moduleUrl(second.version));
  assert.equal(current.value, 2, 'static imports bypass the old cached dependency');
  assert.equal((await current.lazy()).value, 2, 'dynamic imports use the same new release');
  assert.equal(previous.value, 1, 'the previous graph really remains in the module cache');
});

test('builds are deterministic, clean old output and invalidate on HTML or CSS changes', async t => {
  const options = await fixture(t, {
    'index.html': '<script type="module" src="./game.js"></script>',
    'game.js': 'export const value = 1;',
    'style.css': 'body { color: white }',
  });
  const first = await buildPages(options);
  await writeFile(resolve(options.outputDir, 'stale.js'), 'old output');
  const repeat = await buildPages(options);
  assert.equal(repeat.version, first.version);
  await assert.rejects(readFile(resolve(options.outputDir, 'stale.js')), { code: 'ENOENT' });
  await writeFile(resolve(options.sourceDir, 'style.css'), 'body { color: red }');
  const cssChange = await buildPages(options);
  assert.notEqual(cssChange.version, first.version);
  await writeFile(resolve(options.sourceDir, 'index.html'), '<title>Updated</title><script type="module" src="./game.js"></script>');
  const htmlChange = await buildPages(options);
  assert.notEqual(htmlChange.version, cssChange.version);
  await assert.rejects(buildPages({ ...options, outputDir: options.sourceDir }), /separate/);
});
