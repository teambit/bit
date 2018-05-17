const fs = require('fs');
const path = require('path');
const compiler = require('vue-template-compiler');

const DEFAULT_SCRIPT_LANG = 'js';
const DEFAULT_STYLE_LANG = 'scss';

const languageMap = {
    css: "scss",
    stylus: "styl"
}
module.exports = function(partial, filename, directory, config, webpackConfig, configPath, ast, isScript, content, resolveConfig) {
  const cabinet = require('../../filing-cabinet');

  const fileContent = fs.readFileSync(filename);
  const { script, styles } = compiler.parseComponent(fileContent.toString(), { pad: 'line' });
  if (isScript) {
    const scriptExt = script.lang ? languageMap[script.lang] || script.lang : DEFAULT_SCRIPT_LANG;
    return cabinet({
      partial: partial,
      filename: filename,
      directory: path.dirname(filename),
      content: script.content,
      resolveConfig,
      ext: `.${scriptExt}` || path.extname(partial)
    });
  }
  const stylesResult = styles.map(style => {
    const styleExt = style.lang ? languageMap[style.lang] || style.lang : DEFAULT_STYLE_LANG ;
    return cabinet({
      partial: partial,
      filename: `${path.join(path.dirname(filename), path.parse(filename).name)}.${styleExt}`,
      directory: path.dirname(filename),
      content: style.content,
      resolveConfig,
      ext: `.${styleExt}`
    })
  });
  return stylesResult[0];
};
