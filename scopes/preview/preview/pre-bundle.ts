import { join, resolve } from 'path';
import { promisify } from 'util';
import { rspack } from '@rspack/core';
import fs, { existsSync, outputFileSync, readJsonSync } from 'fs-extra';
import type { AspectDefinition } from '@teambit/aspect-loader';
import {
  createHarmonyImports,
  createImports,
  getIdSetters,
  getIdentifiers,
} from '@teambit/harmony.modules.harmony-root-generator';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import normalizePath from 'normalize-path';
import { PreviewAspect } from './preview.aspect';
import { clearConsole } from './pre-bundle-utils';
import { getPreviewDistDir } from './mk-temp-dir';
import { createRspackConfig } from './rspack/rspack.config';

const previewDistDir = getPreviewDistDir();

export const RUNTIME_NAME = 'preview';
export const PUBLIC_DIR = join('public', 'bit-preview');
export const UIROOT_ASPECT_ID = 'teambit.workspace/workspace';

const ENTRY_CONTENT_TEMPLATE = `__IMPORTS__

export const run = (config, customAspects = []) => {
  const isBrowser = typeof window !== "undefined";
  const windowConfig = isBrowser ? window.harmonyAppConfig : undefined;
  const mergedConfig = { ...config, ...windowConfig };
  __ID_SETTERS__
  function render(...props) {
    return Harmony.load(
      [
        ...customAspects,
        __IDENTIFIERS__,
      ],
      __RUNTIME_NAME__,
      mergedConfig
    ).then((harmony) => {
      return harmony
        .run()
        .then(() => harmony.get(__ROOT_ASPECT__))
        .then((rootExtension) => {
          const ssrSetup = !isBrowser && rootExtension.setupSsr;
          const setup = rootExtension.setup;
          const setupFunc = (ssrSetup || setup || function noop() {}).bind(
            rootExtension
          );
          return Promise.resolve(setupFunc()).then(
            () => {
              return rootExtension
            }
          );
        })
        .then((rootExtension) => {
          if (isBrowser) {
            return rootExtension.render(
              __ROOT_EXTENSION_NAME__,
              ...props
            );
          } else {
            return rootExtension.renderSsr(
              __ROOT_EXTENSION_NAME__,
              ...props
            );
          }
        })
        .catch((err) => {
          throw err;
        });
    });
  }
  if (isBrowser || __RUNTIME_NAME__ === "main") render();
};
`;

export const generatePreBundlePreviewEntry = (
  aspectDefs: AspectDefinition[],
  rootExtensionName: string,
  runtimeName: string,
  rootAspectId: string,
  dir: string
) => {
  const harmonyImport = createHarmonyImports();
  const imports = createImports(aspectDefs);
  const identifiers = getIdentifiers(aspectDefs, 'Aspect');
  const idSetters = getIdSetters(aspectDefs, 'Aspect');
  const contents = ENTRY_CONTENT_TEMPLATE.replace('__IMPORTS__', [harmonyImport, imports].join('\n'))
    .replace('__IDENTIFIERS__', identifiers.join(', '))
    .replace('__ID_SETTERS__', idSetters.join('\n'))
    .replaceAll('__RUNTIME_NAME__', JSON.stringify(runtimeName))
    .replaceAll('__ROOT_ASPECT__', JSON.stringify(rootAspectId))
    .replaceAll('__ROOT_EXTENSION_NAME__', JSON.stringify(rootExtensionName));
  const entryPath = resolve(join(dir, `ui-bundle-entry.${sha1(contents)}.js`));
  if (!fs.existsSync(entryPath)) {
    fs.outputFileSync(entryPath, contents);
  }
  return entryPath;
};

export async function buildPreBundlePreview(resolvedAspects: AspectDefinition[], customOutputDir?: string) {
  const outputDir = customOutputDir || resolve(PUBLIC_DIR);
  const mainEntry = generatePreBundlePreviewEntry(
    resolvedAspects,
    UIROOT_ASPECT_ID,
    RUNTIME_NAME,
    PreviewAspect.id,
    __dirname
  );
  const config = createRspackConfig(outputDir, mainEntry);
  const compiler = rspack(config as any);
  const compilerRun = promisify(compiler.run.bind(compiler));
  const results = await compilerRun();
  if (!results) throw new Error();
  if (results?.hasErrors()) {
    clearConsole();
    throw new Error(results?.toString({}));
  }
  return results;
}

export async function generateBundlePreviewEntry(rootAspectId: string, previewPreBundlePath: string, config: object) {
  const manifestPath = join(previewPreBundlePath, 'asset-manifest.json');
  const manifest = readJsonSync(manifestPath);
  const imports = manifest.entrypoints
    .map((entry: string) => {
      const entryPath = normalizePath(join(previewPreBundlePath, entry));
      return entry.endsWith('.js') || entry.endsWith('.cjs') || entry.endsWith('.mjs')
        ? `import { run } from '${entryPath}';`
        : `import '${entryPath}';`;
    })
    .join('\n');
  config['teambit.harmony/bit'] = rootAspectId;

  const contents = [imports, `run(${JSON.stringify(config, null, 2)});`].join('\n');
  const previewRuntime = resolve(join(previewDistDir, `preview.entry.${sha1(contents)}.js`));

  if (!existsSync(previewRuntime)) {
    outputFileSync(previewRuntime, contents);
  }

  return previewRuntime;
}
