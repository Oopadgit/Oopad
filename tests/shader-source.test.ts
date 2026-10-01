import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../src/effects/star-portal/', import.meta.url);
test('authored Shader Buttons archives retain their downloaded SHA-256 hashes', async () => {
  const manifest = JSON.parse(await readFile(new URL('sources/manifest.json', root), 'utf8'));
  let checked = 0;
  for (const file of manifest.files) {
    if (!file.sha256) continue;
    const bytes = await readFile(new URL('sources/' + file.path, root));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
    checked++;
  }
  assert.ok(checked >= 15);
});
test('available family modules only adapt the React module boundary', async () => {
  for (const name of ['ShaderButtons-BHnt6Snj', 'RakingLightPillButton-DYmHe2Uz', 'NeuformIsolatedEffects-CjBYReiF', 'SelectedButtonStudies-fX9ZNVBy', 'ShaderButtonStudies-P15TzB3Q']) {
    const original = await readFile(new URL(`sources/${name}.js.upstream`, root), 'utf8');
    const local = await readFile(new URL(`authored/${name}.js`, root), 'utf8');
    assert.equal(local, original.replaceAll('from"./index-DGTlyxgF.js"', 'from"./runtime-host.js"'), name);
  }
});
