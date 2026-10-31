const path = require('node:path');
module.exports = {
  process: (contents, filename) => {
    const parts = path.parse(filename);
    if (parts.ext.toLowerCase() !== '.svg') return { code: contents };
    const functionName = parts.name.split(/\W+/).reduce((name, word) => name + word.substring(0, 1).toUpperCase() + word.substring(1), '');
    return { code: `
      const React = require('react');
      const ${functionName} = (props) =>
      {
      return React.createElement('svg', {
        ...props,
        'data-jest-file-name': '${parts.base}',
        'data-jest-svg-name': '${parts.name}',
        'data-testid': '${parts.name}'
      });
      }
      module.exports.__esModule = true;
      module.exports.default = '${parts.base}';
      module.exports.ReactComponent = ${functionName};
  ` };
  },
};
