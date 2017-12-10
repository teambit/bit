let logger;

const DocsParser = {
  // getDynamicConfig: (rawConfig) => {
  // },

  init: (rawConfig, dynamicConfig, api) => {
    api.registerActionToHook(api.HOOKS_NAMES['post-tag'], { name: 'parseDocs', run: parseDocs });
    api.registerActionToHook(api.HOOKS_NAMES['post-tag-all'], { name: 'parseDocs', run: parseDocs });
    logger = api.getLogger();
  }
};

const parseDocs = (args) => {
  if (args && args.components && args.components.length) {
    const ids = args.components.map(comp => comp.id);
    logger.debug(`parse docs for ${ids.join()}`);
    return;
  }
  logger.debug('parse docs for unknown components');
};

export default DocsParser;
