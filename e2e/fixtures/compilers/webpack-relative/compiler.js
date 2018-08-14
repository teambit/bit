const compiler = {
  init: ({ rawConfig, dynamicConfig, api }) => {
    return {write: true}
  },
  getDynamicConfig: ({ rawConfig }) => {
  },
  getDynamicPackageDependencies: ({ rawConfig, dynamicConfig, configFiles, context }) => {
  },
  action: ({
    files,
    rawConfig,
    dynamicConfig,
    configFiles,
    api,
    context
  }) => {
  }
}

module.exports = compiler;