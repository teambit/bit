import { basename, dirname, join, parse } from 'path';
import { OnResolveArgs } from 'esbuild';
import fs from 'fs-extra';

type ParsedArgs = {
  scopeName: string;
  componentName: string;
  relativePath: string;
};

function handleConfigFile(args: OnResolveArgs, bundleDir: string) {
  if (
    args.kind === 'require-resolve' &&
    (args.importer.includes('/scopes/') || args.importer.includes('node_modules/@teambit')) &&
    // ignore templates we want to keep it as is
    !args.importer.includes('/templates/')
  ) {
    if (args.path.startsWith('@teambit')) {
      return handleModulePath(args, bundleDir);
    }
    if (args.path.startsWith('.')) {
      return handleRelativePath(args, bundleDir);
    }
  }
  return undefined;
}

function resolveRelativePath(filePath: string) {
  try {
    const resolvedFilePath = require.resolve(filePath);
    return resolvedFilePath;
  } catch {
    const resolvedFilePath = require.resolve(`${filePath}.js`);
    return resolvedFilePath;
  }
}

async function handleRelativePath(args: OnResolveArgs, bundleDir: string) {
  // const parsed = parse(args.path);
  const { componentName, relativePath, scopeName } = await parseArgs(args);
  // const packageDirName = getPackageDirName(args.resolveDir);
  const packageDirName = `@teambit/${componentName}`;
  // const origFilePath = join(args.resolveDir, args.path);
  // const relativePath = getFilePathRelativeToPackage(args.resolveDir, args.path);
  const origFilePath = join(packageDirName, relativePath);
  // const targetDirName = getTargetDirName(args.resolveDir);
  const targetDirName = `${scopeName}.${componentName}`;
  // const targetDir = join(bundleDir, targetDirName, parsed.dir);
  const targetDir = join(bundleDir, targetDirName, dirname(relativePath));
  await fs.ensureDir(targetDir);
  const resolvedFilePath = resolveRelativePath(origFilePath);
  const copyTarget = join(targetDir, basename(resolvedFilePath));
  await fs.copyFile(resolvedFilePath, copyTarget);
  // const newPath = replaceRelativePath(targetDirName, parsed);
  const newPath = `./${targetDirName}/${relativePath}`;
  return {
    path: newPath,
    namespace: 'bit-config-file',
    external: true,
  };
}

async function parseArgs(args: OnResolveArgs): Promise<ParsedArgs> {
  if (args.resolveDir.includes('/scopes/')) {
    return parseArgsFromSrc(args);
  }
  return parseArgsFromNodeModules(args);
}
async function parseArgsFromNodeModules(args: OnResolveArgs): Promise<ParsedArgs> {
  const resolveDir = args.resolveDir;
  const filePath = args.path;
  const parts = resolveDir.split('/@teambit/');
  const idParts = parts[1].split('/');
  const componentName = idParts[0];
  const componentDir = join(parts[0], '@teambit', componentName);
  const relativeResolvedDir = resolveDir.replace(`${componentDir}/`, '');
  const relativePath = join(relativeResolvedDir, filePath.replace('./', ''));
  const packageJsonPath = join(componentDir, 'package.json');
  const jsonValue = await fs.readJson(packageJsonPath);
  const scopeName = jsonValue.componentId.scope.replace('teambit.', '');
  return {
    scopeName,
    componentName,
    relativePath,
  };
}

function parseArgsFromSrc(args: OnResolveArgs): ParsedArgs {
  const resolveDir = args.resolveDir;
  const filePath = args.path;
  const parts = resolveDir.split('/scopes/');
  if (parts.length !== 2) {
    throw new Error('unable to find scopes dir');
  }
  const idParts = parts[1].split('/');
  const scopeName = idParts[0];
  const componentName = idParts[1];
  let relativePath = filePath;
  if (idParts.length > 2) {
    relativePath = join(idParts.slice(2).join('/'), filePath);
  }
  return {
    scopeName,
    componentName,
    relativePath: relativePath.replace('./', ''),
  };
}

async function handleModulePath(args: OnResolveArgs, bundleDir: string) {
  const resolvedFilePath = require.resolve(args.path);
  const parsed = parse(args.path);
  const targetDir = join(bundleDir, 'node_modules', parsed.dir);
  await fs.ensureDir(targetDir);
  await fs.copyFile(resolvedFilePath, join(targetDir, basename(resolvedFilePath)));
  return {
    // Keep the path as-is
    path: args.path,
    namespace: 'bit-config-file',
    external: true,
  };
}

export const configFilesEsbuildPlugin = (bundleDir: string) => {
  return {
    name: 'config-files',
    setup(build) {
      // Intercept import paths starting with "http:" and "https:" so
      // esbuild doesn't attempt to map them to a file system location.
      // Tag them with the "http-url" namespace to associate them with
      // this plugin.
      build.onResolve({ filter: /jest.config$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /jest.cjs.config$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /jest.base.config$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });

      build.onResolve({ filter: /jest.worker$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });

      build.onResolve({ filter: /eslintrc.js$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });

      build.onResolve({ filter: /prettier.config.js$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });

      build.onResolve({ filter: /asset.d.ts$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /style.d.ts$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });

      build.onResolve({ filter: /tsconfig.json$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /tsconfig.cjs.json$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /refreshOverlayInterop$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /webpackHotDevClient$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /mount$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /html-docs-app$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /\/preview.preview.runtime$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /setupTests$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /css-transform$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /file-transform$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /cjs-transformer$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /svg-transformer$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
      build.onResolve({ filter: /file-mock.js$/ }, (args) => {
        return handleConfigFile(args, bundleDir);
      });
    },
  };
};
