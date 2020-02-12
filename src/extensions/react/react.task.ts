import { join } from 'path';
import { TaskContext } from '../pipes';

const tsconfig = {
  compilerOptions: {
    target: 'es5',
    lib: ['dom', 'dom.iterable', 'esnext'],
    allowJs: true,
    skipLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: true,
    forceConsistentCasingInFileNames: true,
    module: 'esnext',
    moduleResolution: 'node',
    resolveJsonModule: true,
    isolatedModules: true,
    noEmit: false,
    sourceMap: true,
    outDir: './dist',
    jsx: 'react'
  }
};

export async function reactTask(context: TaskContext) {
  const capsule = context.component.capsule;
  // TODO: output using logger
  // eslint-disable-next-line no-console
  console.log(capsule.wrkDir);
  // eslint-disable-next-line import/no-dynamic-require
  // eslint-disable-next-line global-require
  const pathToPackageJSON = join(capsule.wrkDir, 'package.json');
  const currentPakcageJsonFile = JSON.parse(capsule.fs.readFileSync(pathToPackageJSON, 'utf-8'));
  currentPakcageJsonFile.devDependencies = currentPakcageJsonFile.devDependencies || {};
  Object.assign(currentPakcageJsonFile.devDependencies, { typescript: '3.7.4' }); // make sure we have the tsc executable
  currentPakcageJsonFile.scripts = currentPakcageJsonFile.scripts || {};
  Object.assign(currentPakcageJsonFile.scripts, {
    tsc: 'tsc -d -p ./tsconfig.json'
  });
  capsule.fs.writeFileSync(pathToPackageJSON, JSON.stringify(currentPakcageJsonFile, undefined, 2));
  capsule.fs.writeFileSync(`${capsule.wrkDir}/tsconfig.json`, JSON.stringify(tsconfig));

  const exec = await capsule.execNode('tsc', []);
  //   `tsc -d -p ./tsconfig.json`
  // TODO: output using logger
  // eslint-disable-next-line no-console
  exec.stdout.on('data', (chunk: any) => console.log(chunk.toString()));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  await new Promise(resolve => {
    exec.on('close', () => resolve());
  });

  // save dists? add new dependencies? change component main file? add further configs?
  const packageJson = JSON.parse(capsule.fs.readFileSync(`${capsule.wrkDir}/package.json`).toString());
  packageJson.main = './dist';
  capsule.fs.writeFileSync(`${capsule.wrkDir}/package.json`, JSON.stringify(packageJson));
}
