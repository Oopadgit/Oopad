import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../src/effects/star-portal/', import.meta.url);
await mkdir(new URL('authored/', root), { recursive: true });
// Mechanical module-link adaptation only. Renderer bodies and embedded HTML
// remain identical to their archived first-party production modules.
for (const name of ['ShaderButtons-BHnt6Snj', 'RakingLightPillButton-DYmHe2Uz', 'NeuformIsolatedEffects-CjBYReiF', 'SelectedButtonStudies-fX9ZNVBy', 'ShaderButtonStudies-P15TzB3Q']) {
  const source = await readFile(new URL(`sources/${name}.js.upstream`, root), 'utf8');
  const local = source.replaceAll('from"./index-DGTlyxgF.js"', 'from"./runtime-host.js"');
  await writeFile(new URL(`authored/${name}.js`, root), local);
}
