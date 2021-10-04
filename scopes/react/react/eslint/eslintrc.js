// Using object
import '@teambit/react.eslint-config-bit-react';

module.exports = {
  extends: [require.resolve('@teambit/react.eslint-config-bit-react')],
  parserOptions: {
    // parser: require.resolve('@typescript-eslint/parser'),
    // createDefaultProgram: true,
    // resolve the env tsconfig.
    project: require.resolve('../typescript/tsconfig.json'),
  },
};
