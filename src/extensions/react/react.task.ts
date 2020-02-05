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
    jsx: 'react',
    preserveSymlinks: true
  }
};

export async function reactTask(context: TaskContext) {
  const capsule = context.component.capsule;
  // TODO: output using logger
  // eslint-disable-next-line no-console
  console.log(capsule.wrkDir);
  capsule.fs.writeFileSync(`${capsule.wrkDir}/tsconfig.json`, JSON.stringify(tsconfig));
  const exec = await capsule.exec({ command: ['tsc', '-d', '-p', './tsconfig.json'] });
  // TODO: output using logger
  // eslint-disable-next-line no-console
  exec.stdout.on('data', chunk => console.log(chunk.toString()));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const promise = new Promise(resolve => {
    exec.stdout.on('close', () => resolve());
  });

  // save dists? add new dependencies? change component main file? add further configs?
  const packageJson = JSON.parse(capsule.fs.readFileSync(`${capsule.wrkDir}/package.json`).toString());
  packageJson.main = './dist';
  capsule.fs.writeFileSync(`${capsule.wrkDir}/package.json`, JSON.stringify(packageJson));
}
