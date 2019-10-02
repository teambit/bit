const babel = require('babel-core');
const Vinyl = require('vinyl');
const path = require('path');
const fs = require('fs-extra');
const resolve = require('resolve');

let logger;

const compiler = {
  init: ({ rawConfig, dynamicConfig, api }) => {
    logger = api.getLogger();
    return { write: true };
  },
  getSchema: () => {
    const schema = {
      "$id": "http://example.com/schemas/schema.json",
      "type": "object",
      "properties": {
        "valToDynamic": {
          "type": "string",
          "description": "prop which will be changed to dynamic val"
        },
        "bablercPath": {
          "type": "string",
          "description": "path to the .babelrc file"
        }
      }
    };
    return schema;
  },
  getDynamicConfig: ({ rawConfig }) => {
    const dynamicConfig = Object.assign({}, rawConfig);
    if (dynamicConfig.valToDynamic){
      dynamicConfig.valToDynamic = 'dyanamicValue';
    }
    return dynamicConfig;
  },
  getDynamicPackageDependencies: ({ rawConfig, dynamicConfig, configFiles, context }) => {
    const dynamicPackageDependencies = {};
    let babelrc = {};
    const vinylBabelrc = getFileByName('.babelrc', configFiles);
    if (vinylBabelrc) {
      const rawBabelrc = vinylBabelrc.contents.toString();
      babelrc = JSON.parse(rawBabelrc);
    }
    const pluginsNames = babelrc.plugins || [];
    const presetsNames = babelrc.presets || [];
    // Function which get a result aggregator and a function to transform name to package name
    // and return a function that get a name, transform it to package name, extract the package version
    // and add it to the result
    const addParsedNameToResult = (result, packageJson, nameToPackageFn) => (name) => {
      const packageName = nameToPackageFn(name);
      const packageVersion = getPackageVersion(packageName, packageJson);
      result[packageName] = packageVersion;
    }
    // Check if there is a reason to load the package.json
    if (pluginsNames.length || presetsNames.length) {
      const componentDir = context && context.componentDir;
      const workspaceDir = context && context.workspaceDir;
      const packageJson = loadPackgeJsonSync(componentDir, workspaceDir);
      pluginsNames.map(addParsedNameToResult(dynamicPackageDependencies, packageJson, getPluginPackageName));
      presetsNames.map(addParsedNameToResult(dynamicPackageDependencies, packageJson, getPresetPackageName));
    }

    return { devDependencies: dynamicPackageDependencies };
  },
  action: ({
    files,
    rawConfig,
    dynamicConfig,
    configFiles,
    api,
    context
  }) => {
    let babelrc = {};
    let plugins = [];
    let presets = [];
    const vinylBabelrc = getFileByName('.babelrc', configFiles);
    if (vinylBabelrc){
      const rawBabelrc = vinylBabelrc.contents.toString();
      babelrc = JSON.parse(rawBabelrc);
      plugins = babelrc.plugins || [];
      presets = babelrc.presets || [];
    }
    const componentDir = context && context.componentDir

    if (componentDir) {
      babelrc.plugins = plugins.map(pluginName => resolvePlugin(componentDir, pluginName));
      babelrc.presets = presets.map(presetName => resolvePreset(componentDir, presetName));
    }

    try {
      const builtFiles = files.map(file => runBabel(file, babelrc, context.rootDistDir)).reduce((a, b) => a.concat(b));
      return { dists: builtFiles};
    } catch (e) {
      throw e;
    }
  }
}

function getFileByName(name, files) {
 return files.find((file) => (file.name === name));
}

function getPluginPackageName(pluginName) {
  const prefix = 'babel-plugin';
  return getPrefixedPackageName(pluginName, prefix);
}

function getPresetPackageName(pluginName) {
  const prefix = 'babel-preset';
  return getPrefixedPackageName(pluginName, prefix);
}

function getPrefixedPackageName(pluginName, prefix) {
  if (pluginName.indexOf(prefix) !== 0) {
    return `${prefix}-${pluginName}`;
  }
  return pluginName;
}

function resolvePlugin(componentDir, pluginName) {
  const resolvedName = getPluginPackageName(pluginName);
  return resolvePackagesFromComponentDir(componentDir, resolvedName);
}

function resolvePreset(componentDir, presetName) {
  const resolvedName = getPresetPackageName(presetName);
  return resolvePackagesFromComponentDir(componentDir, resolvedName);
}

function resolvePackagesFromComponentDir(componentDir, packagName) {
  // This might be done using the paths option in node's built in require.resolve function
  // but this option is only supported since node v8.9.0 so in order to support older versions
  // we used this package
  // const resolvedPackage = require.resolve(packagName, { paths: [componentDir] });
  const resolvedPackage = resolve.sync(packagName, { basedir: componentDir });
  return resolvedPackage;
}

function loadPackgeJsonSync(componentDir, workspaceDir) {
  const packageJsonName = 'package.json';
  let packageJsonPath;
  if (componentDir) {
    packageJsonPath = path.join(componentDir, packageJsonName);
    const packageJson = loadPackgeJsonFromPathSync(packageJsonPath);
    if (packageJson) return packageJson;
  }
  packageJsonPath = path.join(workspaceDir, packageJsonName);
  const packageJson = loadPackgeJsonFromPathSync(packageJsonPath);
  return packageJson;
}

function loadPackgeJsonFromPathSync(packageJsonPath) {
  const exists = fs.pathExistsSync(packageJsonPath);
  if (exists) {
    return fs.readJsonSync(packageJsonPath);
  }
  return undefined;
}

function getPackageVersion(packageName, packageJson) {
  if (!packageName) throw new Error('missing package name argument');
  if (!packageJson) throw new Error('missing package.json file');
  const version = packageJson.dependencies[packageName] || packageJson.devDependencies[packageName] || packageJson.peerDependencies[packageName];
  if (!version) throw new Error(`${packageName} not found in package.json file`);
  return version;
}

function runBabel(file, options, distPath) {
  const { code, map } = babel.transform(file.contents.toString(), options);
  let mappings;
  if (map) {
    mappings = new Vinyl({
      contents: Buffer.from(map.mappings),
      base: distPath,
      path: path.join(distPath, file.relative),
      basename: `${file.basename}.map`
    });
  }
  const distFile = file.clone();
  distFile.base = distPath;
  distFile.path = path.join(distPath, file.relative);
  distFile.contents = mappings ? Buffer.from(`${code}\n\n//# sourceMappingURL=${mappings.basename}`) : Buffer.from(code);
  const result = mappings ? [mappings, distFile] : [distFile];
  return result;
}

module.exports = compiler;