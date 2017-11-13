const pluginType = 'file-type';

function getExtension() {
  return 'st.css';
}

function getTemplate(importSpecifiers) {
  let stNamed = '';
  if (importSpecifiers && importSpecifiers.length) {
    const specifiers = importSpecifiers.map(importSpecifier => importSpecifier.mainFile.name).join(', ');
    stNamed = `-st-named: ${specifiers};`;
  }
  return `:import { 
    -st-from: "{filePath}.st.css"; 
    ${stNamed}
}`;
}

export { getExtension, getTemplate, pluginType };
