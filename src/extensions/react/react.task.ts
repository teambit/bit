import { TaskContext } from '../build';

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
  console.log(capsule.wrkDir);
  capsule.fs.writeFileSync(`${capsule.wrkDir}/tsconfig.json`, JSON.stringify(tsconfig));
  const exec = await capsule.exec({ command: ['tsc', '-d', '-p', './tsconfig.json'] });
  exec.stdout.on('data', chunk => console.log(chunk.toString()));

  const promise = new Promise(resolve => {
    exec.stdout.on('close', () => resolve());
  });

  // save dists? add new dependencies? change component main file? add further configs?
  const packageJson = JSON.parse(capsule.fs.readFileSync(`${capsule.wrkDir}/package.json`).toString());
  packageJson.main = './dist';
  capsule.fs.writeFileSync(`${capsule.wrkDir}/package.json`, JSON.stringify(packageJson));
}
