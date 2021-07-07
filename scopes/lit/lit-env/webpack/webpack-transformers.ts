import {
  WebpackConfigTransformer,
  WebpackConfigMutator,
  WebpackConfigTransformContext,
} from "@teambit/webpack";
import * as stylesRegexes from "@teambit/webpack.modules.style-regexps";

/**
 * Transformation to apply for both preview and dev server
 * @param config
 * @param context
 */
function commonTransformation(
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) {

  const oneOfRule = findOneOfRuleInPreviewConfig(config?.raw?.module?.rules);

  const scssRule = findScssRuleByScssNoModuleRegexp(oneOfRule);
  replaceWithLitScssUse(scssRule);
  return config;
}

/**
 * Transformation for the preview only
 * @param config
 * @param context
 * @returns
 */
export const previewConfigTransformer: WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => {
  const newConfig = commonTransformation(config, context);

  return newConfig;
};

/**
 * Transformation for the dev server only
 * @param config
 * @param context
 * @returns
 */
export const devServerConfigTransformer: WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => {
  const newConfig = commonTransformation(config, context);

  return newConfig;
};

function findOneOfRuleInPreviewConfig(rules: Array<any> = []) {
  const rule = rules.find((rule) => !!rule.oneOf);
  return rule.oneOf;
}

function findScssRuleByScssNoModuleRegexp(rules: Array<any> = []) {
  return rules.find(
    (rule) => rule.test.toString() === stylesRegexes.sassNoModuleRegex.toString()
  );
}

function replaceWithLitScssUse(rule: any) {
  rule.use = [getLitScss(), require.resolve('extract-loader'), getCssLoader(), require.resolve('sass-loader')];
}

function getLitScss() {
  return {
    loader: require.resolve("lit-scss-loader"),
    options: {
      minify: true, // defaults to false
    },
  };
}

function getCssLoader(){
  return {
    loader: require.resolve("css-loader"),
    options: {
        sourceMap: true
    }
}
}