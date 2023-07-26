import { runEsbuild } from './esbuild';
import { generateCoreAspectsBarrelFile } from './generate-core-aspects-exports';
import { generateCoreAspectsModules } from './generate-core-aspects-modules';
import { generatePackageJson } from './create-package-json';
import { generateNpmrc } from './generate-npmrc';

// const outDir = '/Users/giladshoham/dev/bit/bit/bundle';
const outDir = '/tmp/bit-bundle';
const appFile = 'bit.app.js';

async function runBundle() {
  generateNpmrc(outDir);
  await generatePackageJson(outDir);
  await generateCoreAspectsBarrelFile();
  const esbuildRes = await runEsbuild(outDir, appFile);
  await generateCoreAspectsModules(outDir, appFile);
  return esbuildRes;
}

runBundle().then((res) => console.log(JSON.stringify(res, null, 2)));
