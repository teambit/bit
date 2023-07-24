import { ParsedPath, basename, format, join, parse } from 'path';
import { OnResolveArgs } from 'esbuild';
import fs from 'fs-extra';

function handleConfigFile(args: OnResolveArgs, bundleDir: string) {
  console.log('im here', args);
  if (
    args.kind === 'require-resolve' &&
    args.importer.includes('/scopes/') &&
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

async function handleRelativePath(args: OnResolveArgs, bundleDir: string) {
  const parsed = parse(args.path);
  console.log('parsed', parsed);
  const origFilePath = join(args.resolveDir, args.path);
  const targetDirName = getTargetDirName(args.resolveDir);
  const targetDir = join(bundleDir, targetDirName, parsed.dir);
  console.log('🚀 ~ file: config-files-esbuild-plugin.ts:28 ~ handleRelativePath ~ targetDir:', targetDir);
  await fs.ensureDir(targetDir);
  const resolvedFilePath = require.resolve(origFilePath);
  console.log(
    '🚀 ~ file: config-files-esbuild-plugin.ts:32 ~ handleRelativePath ~ resolvedFilePath:',
    resolvedFilePath
  );
  console.log('🚀 ~ file: config-files-esbuild-plugin.ts:32 ~ handleRelativePath ~ origFilePath:', origFilePath);
  console.log(
    '🚀 ~ file: config-files-esbuild-plugin.ts:33 ~ handleRelativePath ~ join(targetDir, parsed.base):',
    join(targetDir, parsed.base)
  );
  console.log(
    '🚀 ~ file: config-files-esbuild-plugin.ts:36 ~ handleRelativePath ~ basename(resolvedFilePath):',
    basename(resolvedFilePath)
  );
  await fs.copyFile(resolvedFilePath, join(targetDir, basename(resolvedFilePath)));
  const newPath = replaceRelativePath(targetDirName, parsed);
  console.log('🚀 ~ file: config-files-esbuild-plugin.ts:38 ~ handleRelativePath ~ newPath:', newPath);

  return {
    path: newPath,
    namespace: 'bit-config-file',
    external: true,
  };
}

function getTargetDirName(resolveDir: string): string {
  const parts = resolveDir.split('/scopes/');
  if (parts.length !== 2) {
    throw new Error('unable to find scopes dir');
  }
  return parts[1].split('/').join('.');
}
function handleModulePath(args: OnResolveArgs, bundleDir: string) {
  return {
    // Keep the path as-is
    path: args.path,
    namespace: 'bit-config-file',
    external: true,
  };
}
function replaceRelativePath(targetDirName: string, parsedPath: ParsedPath) {
  parsedPath.dir = `./${targetDirName}/${parsedPath.dir.replace('./', '')}`;
  const formatted = format(parsedPath);
  return formatted;
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

      // We also want to intercept all import paths inside downloaded
      // files and resolve them against the original URL. All of these
      // files will be in the "http-url" namespace. Make sure to keep
      // the newly resolved URL in the "http-url" namespace so imports
      // inside it will also be resolved as URLs recursively.
      // build.onResolve({ filter: /.*/, namespace: 'http-url' }, args => ({
      //   path: new URL(args.path, args.importer).toString(),
      //   namespace: 'http-url',
      // }))

      // When a URL is loaded, we want to actually download the content
      // from the internet. This has just enough logic to be able to
      // handle the example import from unpkg.com but in reality this
      // would probably need to be more complex.
      // build.onLoad({ filter: /.*/, namespace: 'http-url' }, async (args) => {
      //   let contents = await new Promise((resolve, reject) => {
      //     function fetch(url) {
      //       console.log(`Downloading: ${url}`)
      //       let lib = url.startsWith('https') ? https : http
      //       let req = lib.get(url, res => {
      //         if ([301, 302, 307].includes(res.statusCode)) {
      //           fetch(new URL(res.headers.location, url).toString())
      //           req.abort()
      //         } else if (res.statusCode === 200) {
      //           let chunks = []
      //           res.on('data', chunk => chunks.push(chunk))
      //           res.on('end', () => resolve(Buffer.concat(chunks)))
      //         } else {
      //           reject(new Error(`GET ${url} failed: status ${res.statusCode}`))
      //         }
      //       }).on('error', reject)
      //     }
      //     fetch(args.path)
      //   })
      //   return { contents }
      // })
    },
  };
};
