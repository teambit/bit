import { runEsbuild } from './esbuild';
import { generateCoreAspectsBarrelFile } from './generate-core-aspects-exports';
import { generateCoreAspectsModules } from './generate-core-aspects-modules';
import { generatePackageJson } from './create-package-json';
import { generateNpmrc } from './generate-npmrc';
import { runTsup } from './tsup';
import { copyFilesOfCoreAspects } from './copy-files-of-core-aspects';

// const rootOutDir = '/Users/giladshoham/dev/bit/bit/bundle';
const rootOutDir = '/tmp/bit-bundle';
const bundleDir = `${rootOutDir}/bundle`;
const appFile = 'bit.app.js';

async function runBundle() {
  const esbuildRes = await runEsbuild(bundleDir, appFile);
  // const tsupRes = await runTsup(bundleDir, appFile);
  await generateCoreAspectsModules(rootOutDir, appFile);
  await copyFilesOfCoreAspects(rootOutDir, bundleDir);
  generateNpmrc(rootOutDir);
  await generatePackageJson(rootOutDir);
  await generateCoreAspectsBarrelFile();
  return esbuildRes;
  // return tsupRes;
}

runBundle().then((res) => console.log(JSON.stringify(res, null, 2)));
