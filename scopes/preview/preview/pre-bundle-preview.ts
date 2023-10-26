import { join, resolve } from 'path';
import fs from 'fs-extra';
import { AspectDefinition } from '@teambit/aspect-loader';
import { createImports, getIdSetters, getIdentifiers } from '@teambit/ui/dist/create-root';

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
      __RUNTIME__,
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

          return Promise.resolve(setupFunc()).then(() => rootExtension);
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

  if (isBrowser || __RUNTIME__ === "main") render();
};
`;

export const getEntryForPreBundlePreview = (
  aspectDefs: AspectDefinition[],
  rootExtensionName: string,
  runtime: string,
  rootAspect: string
) => {
  const entryPath = resolve(join(__dirname, `pre-bundle-preview-entry.js`));
  const imports = createImports(aspectDefs);
  const identifiers = getIdentifiers(aspectDefs, 'Aspect');
  const idSetters = getIdSetters(aspectDefs, 'Aspect');
  if (!fs.existsSync(entryPath)) {
    const contents = ENTRY_CONTENT_TEMPLATE.replace('__IMPORTS__', imports)
      .replace('__IDENTIFIERS__', identifiers.join(', '))
      .replace('__ID_SETTERS__', idSetters.join('\n'))
      .replaceAll('__RUNTIME__', JSON.stringify(runtime))
      .replaceAll('__ROOT_ASPECT__', JSON.stringify(rootAspect))
      .replaceAll('__ROOT_EXTENSION_NAME__', JSON.stringify(rootExtensionName));
    fs.outputFileSync(entryPath, contents);
  }
  return entryPath;
};
