import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

async function filesIn(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path, base) : relative(base, path).split(sep).join('/');
  }));
  return files.flat().sort();
}

function versionUrl(url, version) {
  // Keep project-relative routing and non-code assets exactly as authored.
  if (!/^\.\.?\//.test(url)) return url;
  const [, path, query = '', fragment = ''] = url.match(/^([^?#]+)(?:\?([^#]*))?(#.*)?$/) || [];
  if (!path || !/\.(?:m?js|css)$/.test(path)) return url;
  const params = new URLSearchParams(query);
  params.set('v', version);
  return `${path}?${params}${fragment}`;
}

function versionCode(source, version) {
  // Covers static imports, re-exports, side-effect imports and literal dynamic
  // imports, including the multiline import lists in the vendored Three build.
  return source.replace(/\b(from\s*|import\s*(?:\(\s*)?)(['"])([^'"\r\n]+)\2/g,
    (match, prefix, quote, url) => `${prefix}${quote}${versionUrl(url, version)}${quote}`);
}

function versionMarkup(source, version) {
  return source.replace(/\b(src|href)=(['"])([^'"]+)\2/g,
    (match, attribute, quote, url) => `${attribute}=${quote}${versionUrl(url, version)}${quote}`);
}

function versionStyles(source, version) {
  return source.replace(/(url\(\s*|@import\s+(?=['"]))(['"]?)([^'"\s)]+)\2/g,
    (match, prefix, quote, url) => `${prefix}${quote}${versionUrl(url, version)}${quote}`);
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Records which build a page came from (for example "Preview · branch · sha")
// as a meta tag directly after the viewport meta, keeping its indentation.
// The game reads it to show the build in the menu; production builds carry
// no label and their markup is left untouched.
function labelMarkup(source, label) {
  const meta = `<meta name="cricsim-build" content="${escapeAttribute(label)}">`;
  const viewport = /^([ \t]*)<meta\s[^>]*\bname=(["'])viewport\2[^>]*>/im;
  if (viewport.test(source)) return source.replace(viewport, (tag, indent) => `${tag}\n${indent}${meta}`);
  const head = /<head\b[^>]*>/i;
  if (head.test(source)) return source.replace(head, tag => `${tag}\n${meta}`);
  throw new Error('index.html has no viewport meta or <head> to label.');
}

export async function buildPages({ sourceDir = resolve(root, 'dist'), outputDir = resolve(root, '.pages-dist'), label = '' } = {}) {
  sourceDir = resolve(sourceDir);
  outputDir = resolve(outputDir);
  if (sourceDir === outputDir || sourceDir.startsWith(`${outputDir}${sep}`) || outputDir.startsWith(`${sourceDir}${sep}`)) {
    throw new Error('Pages output must be separate from its source directory.');
  }
  const files = await filesIn(sourceDir);
  const codeFiles = files.filter(file => /\.(?:m?js|css|html)$/.test(file));
  const sources = await Promise.all(codeFiles.map(async file => [file, await readFile(resolve(sourceDir, file), 'utf8')]));
  // One release token prevents a new entry point from reusing cached modules
  // from an earlier release. Include this transform and HTML in the digest so
  // build-only and markup-only changes also receive fresh module URLs.
  const hash = createHash('sha256').update(await readFile(scriptPath));
  for (const [file, source] of sources) hash.update('\0').update(file).update('\0').update(source);
  // A relabelled build (for example a preview of the same tree) is a new release.
  if (label) hash.update('\0label\0').update(label);
  const version = hash.digest('hex').slice(0, 16);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true });
  for (const [file, source] of sources) {
    const extension = extname(file);
    let transformed = extension === '.html' ? versionMarkup(source, version)
      : extension === '.css' ? versionStyles(source, version) : versionCode(source, version);
    if (file === 'index.html' && label) transformed = labelMarkup(transformed, label);
    await writeFile(resolve(outputDir, file), transformed);
  }
  return { version, outputDir, files: files.length, label };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const result = await buildPages({ label: process.env.CRICSIM_BUILD_LABEL || '' });
  const labelled = result.label ? `, labelled "${result.label}"` : '';
  console.log(`Built ${result.files} files in ${relative(root, result.outputDir)} (release ${result.version}${labelled})`);
}
