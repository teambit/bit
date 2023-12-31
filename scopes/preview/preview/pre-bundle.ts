/* eslint-disable no-console */

import { join, resolve } from 'path';
import fs, { existsSync, outputFileSync, readJsonSync } from 'fs-extra';
import { AspectDefinition } from '@teambit/aspect-loader';
// import { CacheMain } from '@teambit/cache';
// import { Logger } from '@teambit/logger';
// import { UIRoot, UiMain } from '@teambit/ui';
import { createHarmonyImports, createImports, getIdSetters, getIdentifiers } from '@teambit/ui';
// import { UIRoot, UiMain, createImports, getIdSetters, getIdentifiers } from '@teambit/ui';
// import { PreBundleContext, doBuild } from '@teambit/ui/pre-bundle/build';
import { sha1 } from '@teambit/legacy/dist/utils';
import webpack from 'webpack';
import { promisify } from 'util';
import { PreviewAspect } from './preview.aspect';
// import createPreBundleConfig from './webpack/webpack.prebundle.config';
import { createWebpackConfig, clearConsole } from './pre-bundle-utils';

export const PRE_BUNDLE_PREVIEW_RUNTIME_NAME = 'preview';
export const PRE_BUNDLE_PREVIEW_TASK_NAME = 'PreBundlePreview';
export const PRE_BUNDLE_PREVIEW_ID = PreviewAspect.id;
export const PRE_BUNDLE_PREVIEW_DIR = 'ui-bundle';
export const PRE_BUNDLE_PREVIEW_PUBLIC_DIR = 'public/bit-preview';

const ENTRY_CONTENT_TEMPLATE = `__IMPORTS__
console.log(typeof Harmony)
console.log(Harmony)
export const run = (config, customAspects = []) => {
  console.log('run', config, customAspects)
  const isBrowser = typeof window !== "undefined";
  const windowConfig = isBrowser ? window.harmonyAppConfig : undefined;
  const mergedConfig = { ...config, ...windowConfig };
  __ID_SETTERS__
  function render(...props) {
    // console.log('render', props)
    return Harmony.load(
      [
        ...customAspects,
        __IDENTIFIERS__,
      ],
      __RUNTIME_NAME__,
      mergedConfig
    ).then((harmony) => {
      // console.log('harmony', harmony)
      return harmony
        .run()
        .then(() => harmony.get(__ROOT_ASPECT__))
        .then((rootExtension) => {
          // console.log('rootExtension', rootExtension)
          const ssrSetup = !isBrowser && rootExtension.setupSsr;
          const setup = rootExtension.setup;
          const setupFunc = (ssrSetup || setup || function noop() {}).bind(
            rootExtension
          );
          // console.log('setupFunc', setupFunc)
          return Promise.resolve(setupFunc()).then(
            () => {
              // console.log('rootExtension 2', rootExtension)
              return rootExtension
            }
          );
        })
        .then((rootExtension) => {
          // console.log('rootExtension 3', rootExtension)
          if (isBrowser) {
            // console.log('render', rootExtension)
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
  console.log('\n[generatePreBundlePreviewEntry]', {
    rootExtensionName,
    runtimeName,
    rootAspectId,
    dir,
    entryPath,
  });
  console.log(contents);
  if (!fs.existsSync(entryPath)) {
    fs.outputFileSync(entryPath, contents);
  }
  return entryPath;
};

// export async function getPreBundlePreviewContext(
//   uiRootAspectId: string,
//   uiRoot: UIRoot,
//   cache: CacheMain,
//   logger: Logger
// ): Promise<PreBundleContext> {
//   const context: PreBundleContext = {
//     config: {
//       runtime: PRE_BUNDLE_PREVIEW_RUNTIME_NAME,
//       bundleId: PRE_BUNDLE_PREVIEW_ID,
//       aspectId: uiRootAspectId,
//       bundleDir: PRE_BUNDLE_PREVIEW_DIR,
//       aspectDir: '',
//       publicDir: PRE_BUNDLE_PREVIEW_PUBLIC_DIR,
//     },
//     uiRoot,
//     cache,
//     logger,
//     getWebpackConfig: async (name: string, outputPath: string, localPublicDir: string) => {
//       const resolvedAspects = await uiRoot.resolveAspects(PRE_BUNDLE_PREVIEW_RUNTIME_NAME);
//       console.log('\n[getPreBundlePreviewContext.getWebpackConfig]', {
//         name,
//         outputPath,
//         localPublicDir,
//         uiRootAspectId,
//         __dirname,
//       });

//       const mainEntry = generatePreBundlePreviewEntry(
//         resolvedAspects,
//         PRE_BUNDLE_PREVIEW_ID,
//         PRE_BUNDLE_PREVIEW_RUNTIME_NAME,
//         uiRootAspectId,
//         __dirname
//       );

//       const config = createPreBundleConfig(resolve(outputPath, localPublicDir), mainEntry);

//       return [config];
//     },
//   };
//   return context;
// }

// export async function buildPreBundlePreview(
//   uiMain: UiMain,
//   outputPath: string
// ): Promise<webpack.MultiStats | undefined> {
//   const { uiRoot, uiRootAspectId, logger, cache } = uiMain.getUiRootContext();
//   logger.debug(`pre-bundle for preview: start`);
//   console.log('\n[buildPreBundlePreview]', {
//     uiRootAspectId,
//     outputPath,
//   });
//   const context = await getPreBundlePreviewContext(uiRootAspectId, uiRoot, cache, logger);
//   const results = await doBuild(context, outputPath);
//   return results;
// }

export async function buildPreBundlePreview(resolvedAspects: AspectDefinition[], customOutputDir?: string) {
  const outputDir = customOutputDir || resolve(PRE_BUNDLE_PREVIEW_PUBLIC_DIR);
  const uiRootAspectId = 'teambit.workspace/workspace';
  const mainEntry = generatePreBundlePreviewEntry(
    resolvedAspects,
    uiRootAspectId,
    PRE_BUNDLE_PREVIEW_RUNTIME_NAME,
    PRE_BUNDLE_PREVIEW_ID,
    __dirname
  );
  console.log('\n[buildPreBundlePreview] input/output', {
    outputDir,
    mainEntry,
  });
  const config = createWebpackConfig(outputDir, mainEntry);
  // console.log('\n[buildPreBundlePreview] config', config);
  const compiler = webpack(config);
  const compilerRun = promisify(compiler.run.bind(compiler));
  const results = await compilerRun();
  // console.log('\n[buildPreBundlePreview] results', results && results.hasErrors());
  if (!results) throw new Error();
  if (results?.hasErrors()) {
    clearConsole();
    throw new Error(results?.toString());
  }

  return results;
}

export async function generateBundlePreviewEntry(rootAspectId: string, previewPreBundlePath: string, config: object) {
  const manifestPath = join(previewPreBundlePath, 'asset-manifest.json');
  const manifest = readJsonSync(manifestPath);
  const imports = manifest.entrypoints
    .map(
      (entry: string) =>
        entry.endsWith('.js')
          ? `import { run } from '${previewPreBundlePath}/${entry}';`
          : `import '${previewPreBundlePath}/${entry}';`
      // entry.endsWith('.js')
      //   ? `import { run } from '@teambit/preview/artifacts/ui-bundle/${entry}';`
      //   : `import '@teambit/preview/artifacts/ui-bundle/${entry}';`
    )
    .join('\n');
  config['teambit.harmony/bit'] = rootAspectId;

  const contents = [
    imports,
    // `console.log('preview-run', run)`,
    `run(${JSON.stringify(config, null, 2)});`,
  ].join('\n');
  const previewRuntime = resolve(join(__dirname, `preview.entry.${sha1(contents)}.js`));
  console.log('\n[generateBundlePreviewEntry]', {
    name: rootAspectId,
    previewPreBundlePath,
    manifestPath,
    previewRuntime,
  });
  console.log(contents);

  if (!existsSync(previewRuntime)) {
    outputFileSync(previewRuntime, contents);
  }

  return previewRuntime;
}
