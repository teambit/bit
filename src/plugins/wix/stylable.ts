import R from 'ramda';

const pluginType = 'file-type';

function getExtension() {
  return 'st.css';
}

function getTemplate(importSpecifiers) {
  let stNamed = '';

  if (importSpecifiers && importSpecifiers.length) {
    const specifiers = importSpecifiers
      .map((importSpecifier) => {
        const mainFile =
          R.path(['importSpecifier', 'mainFile'], importSpecifier) ||
          R.path(['importSpecifier', 'importSpecifiers', 'mainFile'], importSpecifier);
        return mainFile;
      })
      .join(', ');
    stNamed = `-st-named: ${specifiers};`;
  }
  return `:import { 
    -st-from: "{filePath}.st.css"; 
    ${stNamed}
}`;
}

export { getExtension, getTemplate, pluginType };
