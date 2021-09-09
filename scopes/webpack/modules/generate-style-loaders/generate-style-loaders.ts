type PreProcessOptions = {
  resolveUrlLoaderPath: string;
  preProcessorPath: string;
};

export type GenerateStyleLoadersOptions = {
  /** the loader injecting the css to the html. style-loader / mini-css-extract-plugin */
  injectingLoader: any;
  cssLoaderPath: string;
  cssLoaderOpts: any;
  postCssLoaderPath: string;
  postCssConfig?: any;
  shouldUseSourceMap?: boolean;
  preProcessOptions?: PreProcessOptions;
};

export function generateStyleLoaders(options: GenerateStyleLoadersOptions) {
  const loaders = [
    {
      loader: options.injectingLoader,
    },
    {
      loader: options.cssLoaderPath,
      options: options.cssLoaderOpts,
    },
    {
      // Options for PostCSS as we reference these options twice
      // Adds vendor prefixing based on your specified browser support in
      // package.json
      loader: options.postCssLoaderPath,
      options: {
        // We don't use the config file way to make it easier to mutate it by other envs
        postcssOptions: options.postCssConfig,
        sourceMap: options.shouldUseSourceMap,
      },
    },
  ].filter(Boolean);
  if (options.preProcessOptions) {
    loaders.push(
      {
        loader: options.preProcessOptions.resolveUrlLoaderPath,
        options: {
          sourceMap: options.shouldUseSourceMap,
        },
      },
      {
        loader: options.preProcessOptions.preProcessorPath,
        options: {
          sourceMap: true,
        },
      }
    );
  }
  return loaders;
}
