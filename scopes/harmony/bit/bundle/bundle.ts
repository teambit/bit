import { runEsbuild } from './esbuild';

async function runBundle() {
  const esbuildRes = await runEsbuild();
  return esbuildRes;
}

runBundle().then((res) => console.log(JSON.stringify(res, null, 2)));
