// import BuiltinModule from 'module';
// const Module = module.constructor.length > 1 ? module.constructor : BuiltinModule;
// attachRequire('.js');
import assert from 'assert';
hookRequire();
import { readFileSync } from 'fs';
import harmony from '@teambit/harmony';
import { handleErrorAndExit } from 'bit-bin/dist/cli/command-runner';
import { ConfigExt } from '@teambit/config';
import { BitExt, registerCoreExtensions } from '@teambit/bit';
import { CLIExtension } from './cli.extension';
import { bootstrap } from 'bit-bin/dist/bootstrap';

function hookRequire() {
  module.constructor.prototype.require = function (path) {
    var self = this;
    assert(typeof path === 'string', 'path must be a string');
    assert(path, 'missing path');
    if (path.includes('@teambit') && !path.includes('dist')) {
      const splitPath = path.split('/');
      splitPath.splice(2, 0, 'dist');
      const newPath = splitPath.join('/');
      return self.constructor._load(newPath, self);
    }

    return self.constructor._load(path, self);
  };
}

initApp();

async function initApp() {
  try {
    await bootstrap();
    registerCoreExtensions();
    await harmony.run(ConfigExt);
    await harmony.set([BitExt]);
    await runCLI();
  } catch (err) {
    const originalError = err.originalError || err;
    handleErrorAndExit(originalError, process.argv[2]);
  }
}

async function runCLI() {
  const cli: CLIExtension = harmony.get('CLIExtension');
  if (!cli) throw new Error(`failed to get CLIExtension from Harmony`);
  await cli.run();
}

// function attachRequire(extension: string) {
//   const prefix = '@teambit';
//   const originalJSLoader = Module._extensions['.js'];
//   const oldLoader = Module._extensions[extension] || originalJSLoader;

//   require.extensions[extension] = (module, filename) => {
//     // console.log(filename);
//     if (filename.includes(prefix) && !filename.includes('@teambit/harmony') && !filename.includes('@teambit/gitconfig')) {
//       const [nodeModulesPath, modulePath] = filename.split(prefix);
//       const split = modulePath.split('/');
//       split.shift();
//       // split.splice(0, 1, 'dist');
//       split.splice(0, 0, [nodeModulesPath, '@teambit'].join(''));
//       const distPath = split.join('/');
//       const distModule = readFileSync(distPath, 'utf-8');

//       // console.log(filename, distPath);
//       return module._compile(distModule, filename);
//     }

//     console.log(filename);
//     return oldLoader(module, filename);
//   };
// }
