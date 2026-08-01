#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sdkRoot = path.join(root, 'sdk');
const pkg = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(sdkRoot, 'README.md'), 'utf8');
const changelog = fs.readFileSync(path.join(sdkRoot, 'CHANGELOG.md'), 'utf8');
const license = fs.readFileSync(path.join(sdkRoot, 'LICENSE'), 'utf8');
const provenance = fs.readFileSync(path.join(sdkRoot, 'SOURCE_PROVENANCE.md'), 'utf8');

assert.equal(pkg.name, '@decide-fyi/sdk');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.license, 'Apache-2.0');
assert.equal(pkg.author, 'Decide');
assert.equal(pkg.homepage, 'https://www.decide.fyi/sdk');
assert.deepEqual(pkg.repository, {
  type: 'git',
  url: 'git+https://github.com/decidefyi/decide.git',
  directory: 'sdk'
});
assert.equal(pkg.publishConfig?.access, 'public');
assert.equal(pkg.main, './decide.js');
assert.equal(pkg.types, './decide.d.ts');
assert.equal(pkg.bin?.decide, 'bin/decide.js');
assert.ok(readme.includes(`@decide-fyi/sdk@${pkg.version}`));
assert.ok(readme.includes('https://github.com/decidefyi/decide/tree/main/sdk'));
assert.ok(changelog.includes(`## ${pkg.version}`));
assert.ok(license.includes('Apache License'));
assert.ok(provenance.includes(`@decide-fyi/sdk@${pkg.version}`));

const sdk = require(path.join(sdkRoot, 'decide.js'));
assert.equal(typeof sdk.createDecideClient, 'function');
assert.equal(typeof sdk.verifyDecisionRecord, 'function');

const packResult = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: sdkRoot,
    encoding: 'utf8'
  })
)[0];
const packedFiles = new Set(packResult.files.map((file) => file.path));

for (const required of [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'SOURCE_PROVENANCE.md',
  'decide.js',
  'decide.d.ts',
  'conformance.js',
  'conformance.d.ts',
  'verifier.js',
  'verifier.d.ts',
  'bin/decide.js'
]) {
  assert.ok(packedFiles.has(required), `npm package is missing ${required}`);
}

console.log(`Public SDK package verified: ${pkg.name}@${pkg.version} (${packResult.files.length} files)`);
