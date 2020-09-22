import { requireWithUndefinedGlobalWindow } from '../../../../../../utils/require-pkg-with-undefined-window';

export default function (src, options: Record<string, any> = {}) {
  const compiler = requireWithUndefinedGlobalWindow('vue-template-compiler');
  const finalDependencies = {};
  const addDependencies = (dependencies, isScript) => {
    let objDependencies = {};
    if (Array.isArray(dependencies)) {
      dependencies.forEach((dependency) => {
        objDependencies[dependency] = {};
      });
    } else {
      objDependencies = dependencies;
    }
    Object.keys(objDependencies).forEach((dependency) => {
      finalDependencies[dependency] = objDependencies[dependency];
      finalDependencies[dependency].isScript = isScript;
    });
  };

  const { script, styles } = compiler.parseComponent(src, { pad: 'line' });
  // it must be required here, otherwise, it'll be a cyclic dependency
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const precinct = require('../../precinct').default;
  if (script) {
    if (script.lang) {
      options.type = script.lang;
    } else {
      options.useContent = true;
    }
    const dependencies = precinct(script.content, options);
    addDependencies(dependencies, true);
  }
  if (styles) {
    styles.forEach((style) => {
      const dependencies = precinct(style.content, { type: style.lang || 'scss' });
      addDependencies(dependencies, false);
    });
  }

  return finalDependencies;
}
