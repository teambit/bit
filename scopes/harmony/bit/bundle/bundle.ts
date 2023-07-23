import { runEsbuild } from './esbuild';
import { generateCoreAspectsBarrelFile } from './generate-core-aspects-exports';

async function runBundle() {
  await generateCoreAspectsBarrelFile();
  const esbuildRes = await runEsbuild();
  return esbuildRes;
}

runBundle().then((res) => console.log(JSON.stringify(res, null, 2)));
