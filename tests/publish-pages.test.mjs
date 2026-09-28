import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'scripts/publish-pages.sh');
const run = promisify(execFile);
const identity = ['-c', 'user.name=CricSim tests', '-c', 'user.email=tests@example.invalid'];
const shellIdentity = identity.map(argument => `'${argument}'`).join(' ');

// Runs the real script against a local bare repository that stands in for
// GitHub. Git only ever sees the temporary directory: a private global config
// keeps the tests independent of the machine's identity and the CricSim
// checkout's own repository is never touched.
async function fixture(t) {
  const directory = await mkdtemp(resolve(root, '.pages-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bare = resolve(directory, 'pages.git');
  const gitConfig = resolve(directory, 'gitconfig');
  await writeFile(gitConfig, '[gc]\n\tauto = 0\n');
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    PUBLISH_PAGES_RETRY_DELAY: '0',
    PUBLISH_PAGES_TEST_HOOK: '',
    GITHUB_OUTPUT: '',
  };
  const git = async (...args) => (await run('git', [...identity, ...args], { env })).stdout;
  await git('-c', 'init.defaultBranch=main', 'init', '--quiet', '--bare', bare);
  let sources = 0;
  async function source(files) {
    const sourceDir = resolve(directory, `source-${sources++}`);
    for (const [file, contents] of Object.entries(files)) {
      await mkdir(dirname(resolve(sourceDir, file)), { recursive: true });
      await writeFile(resolve(sourceDir, file), contents);
    }
    return sourceDir;
  }
  async function publish(files, options = {}) {
    const { destination = '', remove = false, ...extra } = options;
    const sourceDir = files ? await source(files) : resolve(directory, 'missing');
    return run('bash', [script], {
      cwd: directory,
      env: {
        ...env,
        SOURCE_DIR: sourceDir,
        DESTINATION: destination,
        DELETE_DESTINATION: remove ? '1' : '0',
        PAGES_REMOTE: bare,
        PAGES_URL_BASE: 'https://example.test/CricSim',
        ...extra,
      },
    });
  }
  const tree = async () => (await git('-C', bare, 'ls-tree', '-r', '--name-only', 'gh-pages')).trim().split('\n').sort();
  const show = path => git('-C', bare, 'show', `gh-pages:${path}`);
  const commits = async () => Number((await git('-C', bare, 'rev-list', '--count', 'gh-pages')).trim());
  const subjects = async () => (await git('-C', bare, 'log', '--format=%s', 'gh-pages')).trim().split('\n');
  return { directory, bare, git, publish, tree, show, commits, subjects };
}

const site = {
  'index.html': '<!doctype html><title>root</title>',
  'game.js': 'export const value = 1;',
  'assets/ball.jpg': 'jpg',
};
const preview = {
  'index.html': '<!doctype html><title>preview</title>',
  'game.js': 'export const value = 2;',
  'draft.js': 'export const draft = true;',
};

test('the first deploy creates the pages branch with the files and .nojekyll', async t => {
  const pages = await fixture(t);
  const { stdout } = await pages.publish(site);
  assert.deepEqual(await pages.tree(), ['.nojekyll', 'assets/ball.jpg', 'game.js', 'index.html']);
  assert.equal(await pages.show('index.html'), site['index.html']);
  assert.equal(await pages.commits(), 1);
  assert.match(stdout, /URL: https:\/\/example\.test\/CricSim\/$/m);
  const author = await pages.git('-C', pages.bare, 'log', '-1', '--format=%an <%ae>|%cn <%ce>', 'gh-pages');
  const bot = 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>';
  assert.equal(author.trim(), `${bot}|${bot}`);
});

test('a preview deploy adds its directory without touching the root files', async t => {
  const pages = await fixture(t);
  await pages.publish(site);
  const { stdout } = await pages.publish(preview, { destination: 'preview/foo' });
  assert.deepEqual(await pages.tree(), [
    '.nojekyll', 'assets/ball.jpg', 'game.js', 'index.html',
    'preview/foo/draft.js', 'preview/foo/game.js', 'preview/foo/index.html',
  ]);
  assert.equal(await pages.show('index.html'), site['index.html']);
  assert.equal(await pages.show('preview/foo/index.html'), preview['index.html']);
  assert.equal(await pages.commits(), 2);
  assert.match(stdout, /URL: https:\/\/example\.test\/CricSim\/preview\/foo\/$/m);
});

test('a later root deploy replaces the root, drops stale root files and keeps previews', async t => {
  const pages = await fixture(t);
  await pages.publish(site);
  await pages.publish(preview, { destination: 'preview/foo' });
  const release = { 'index.html': '<!doctype html><title>root v2</title>', 'game.js': 'export const value = 3;', 'physics.js': 'export {};' };
  await pages.publish(release);
  assert.deepEqual(await pages.tree(), [
    '.nojekyll', 'game.js', 'index.html', 'physics.js',
    'preview/foo/draft.js', 'preview/foo/game.js', 'preview/foo/index.html',
  ]);
  assert.equal(await pages.show('index.html'), release['index.html']);
  assert.equal(await pages.show('game.js'), release['game.js']);
  assert.equal(await pages.show('preview/foo/game.js'), preview['game.js']);
  assert.equal(await pages.commits(), 3);
});

test('a later preview deploy replaces the preview directory completely', async t => {
  const pages = await fixture(t);
  await pages.publish(site);
  await pages.publish(preview, { destination: 'preview/foo' });
  const next = { 'index.html': '<!doctype html><title>preview v2</title>', 'game.js': 'export const value = 4;' };
  await pages.publish(next, { destination: 'preview/foo' });
  assert.deepEqual(await pages.tree(), [
    '.nojekyll', 'assets/ball.jpg', 'game.js', 'index.html',
    'preview/foo/game.js', 'preview/foo/index.html',
  ]);
  assert.equal(await pages.show('preview/foo/index.html'), next['index.html']);
  assert.equal(await pages.show('index.html'), site['index.html']);
});

test('delete mode removes the preview directory and leaves the root', async t => {
  const pages = await fixture(t);
  await pages.publish(site);
  await pages.publish(preview, { destination: 'preview/foo' });
  await pages.publish(preview, { destination: 'preview/bar' });
  const { stdout } = await pages.publish(null, { destination: 'preview/foo', remove: true });
  assert.deepEqual(await pages.tree(), [
    '.nojekyll', 'assets/ball.jpg', 'game.js', 'index.html',
    'preview/bar/draft.js', 'preview/bar/game.js', 'preview/bar/index.html',
  ]);
  assert.match(stdout, /Removed preview\/foo/);
  assert.equal(await pages.commits(), 4);
  await assert.rejects(pages.publish(null, { destination: '', remove: true }), /refusing to empty the site root/);
  const missing = await pages.publish(null, { destination: 'preview/foo', remove: true });
  assert.match(missing.stdout, /No changes to publish/);
  assert.equal(await pages.commits(), 4);
});

test('a deploy without changes exits 0 and creates no commit', async t => {
  const pages = await fixture(t);
  await pages.publish(site);
  await pages.publish(preview, { destination: 'preview/foo' });
  for (const options of [{}, { destination: 'preview/foo' }]) {
    const { stdout } = await pages.publish(options.destination ? preview : site, options);
    assert.match(stdout, /No changes to publish/);
    assert.doesNotMatch(stdout, /Published/);
  }
  assert.equal(await pages.commits(), 2);
});

test('a rejected push is retried on top of the newer branch tip', async t => {
  const pages = await fixture(t);
  await pages.publish(site);
  // Between the script's first commit and its first push, another publisher
  // (a preview deploy) lands on gh-pages, so the push is non-fast-forward.
  const hook = resolve(pages.directory, 'race.sh');
  const log = resolve(pages.directory, 'race.log');
  await writeFile(hook, `#!/usr/bin/env bash
set -euo pipefail
echo "hook ran with $1" >> ${JSON.stringify(log)}
clone=${JSON.stringify(resolve(pages.directory, 'racer'))}
git clone --quiet --branch gh-pages ${JSON.stringify(pages.bare)} "$clone"
mkdir -p "$clone/preview/other"
echo '<title>other preview</title>' > "$clone/preview/other/index.html"
git -C "$clone" ${shellIdentity} add -A
git -C "$clone" ${shellIdentity} commit --quiet -m 'Publish preview/other'
git -C "$clone" push --quiet origin HEAD:gh-pages
`);
  await chmod(hook, 0o755);
  const release = { 'index.html': '<!doctype html><title>root v2</title>', 'game.js': 'export const value = 5;' };
  const { stdout } = await pages.publish(release, { PUBLISH_PAGES_TEST_HOOK: hook, COMMIT_MESSAGE: 'Publish site root v2' });
  assert.match(stdout, /Push rejected; retrying \(2 of 5\)/);
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1, 'the hook ran once');
  assert.deepEqual(await pages.tree(), ['.nojekyll', 'game.js', 'index.html', 'preview/other/index.html']);
  assert.equal(await pages.show('index.html'), release['index.html']);
  assert.deepEqual(await pages.subjects(), ['Publish site root v2', 'Publish preview/other', 'Publish site root']);
  assert.equal(await pages.commits(), 3);
});

test('destinations outside the site root are refused', async t => {
  const pages = await fixture(t);
  for (const destination of ['/etc', '../escape', 'preview/../..', '.git/hooks']) {
    await assert.rejects(pages.publish(site, { destination }), /DESTINATION/);
  }
  await assert.rejects(pages.publish(null), /SOURCE_DIR is not a directory/);
  await assert.rejects(pages.git('-C', pages.bare, 'rev-parse', '--verify', 'gh-pages'), 'nothing was published');
});
