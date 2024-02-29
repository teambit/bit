import { runEsbuild } from './esbuild';
import { generateCoreAspectsBarrelFile } from './generate-core-aspects-exports';
import { generateCoreAspectsModules } from './generate-core-aspects-modules';
import { generatePackageJson } from './create-package-json';
import { generateNpmrc } from './generate-npmrc';
import { runTsup } from './tsup';
import { copyFilesOfCoreAspects } from './copy-files-of-core-aspects';
import { copyOtherFiles } from './copy-other-files';
import { generateSeaConfig } from './generate-sea-config';

// const rootOutDir = '/Users/giladshoham/dev/bit/bit/bundle';
const rootOutDir = '/tmp/bit-bundle';
const bundleDirName = 'bundle';
const bundleDir = `${rootOutDir}/${bundleDirName}`;
const appFileBaseName = 'bit.app';
const jsAppFile = `${appFileBaseName}.js`;
const blobAppFile = `${appFileBaseName}.blob`;

async function runBundle() {
  const esbuildRes = await runEsbuild(bundleDir, jsAppFile);
  // const tsupRes = await runTsup(bundleDir, jsAppFile);
  await generateCoreAspectsModules(rootOutDir, jsAppFile);
  await copyFilesOfCoreAspects(rootOutDir, bundleDir);
  await copyOtherFiles(bundleDir);
  generateNpmrc(rootOutDir);
  await generatePackageJson(rootOutDir, bundleDirName, jsAppFile);
  await generateCoreAspectsBarrelFile();
  await generateSeaConfig(bundleDir, jsAppFile, blobAppFile);
  return esbuildRes;
  // return tsupRes;
}

runBundle().then((res) => console.log(JSON.stringify(res, null, 2)));
