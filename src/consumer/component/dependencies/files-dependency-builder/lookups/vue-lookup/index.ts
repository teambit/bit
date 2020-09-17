import { requireWithUndefinedGlobalWindow } from '../../../../../../utils/require-pkg-with-undefined-window';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const fs = require('fs');
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const path = require('path');

const DEFAULT_SCRIPT_LANG = 'js';
const DEFAULT_STYLE_LANG = 'scss';

const languageMap = {
  css: 'scss',
  stylus: 'styl',
};
export default function (options) {
  const { dependency, filename, isScript } = options;
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const cabinet = require('../../filing-cabinet').default;

  const fileContent = fs.readFileSync(filename);
  const compiler = requireWithUndefinedGlobalWindow('vue-template-compiler');
  const { script, styles } = compiler.parseComponent(fileContent.toString(), { pad: 'line' });
  if (isScript) {
    const scriptExt = script.lang ? languageMap[script.lang] || script.lang : DEFAULT_SCRIPT_LANG;
    return cabinet(
      Object.assign(options, {
        directory: path.dirname(filename),
        content: script.content,
        ast: null,
        ext: `.${scriptExt}` || path.extname(dependency),
      })
    );
  }
  const stylesResult = styles.map((style) => {
    const styleExt = style.lang ? languageMap[style.lang] || style.lang : DEFAULT_STYLE_LANG;
    return cabinet(
      Object.assign(options, {
        filename: `${path.join(path.dirname(filename), path.parse(filename).name)}.${styleExt}`,
        directory: path.dirname(filename),
        content: style.content,
        ast: null,
        ext: `.${styleExt}`,
      })
    );
  });
  return stylesResult[0];
}
