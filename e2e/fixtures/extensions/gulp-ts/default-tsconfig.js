const tsconfig = {
  target: 'es5',
  lib: ['dom', 'dom.iterable', 'esnext'],
  allowJs: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  strict: true,
  forceConsistentCasingInFileNames: true,
  module: 'esnext',
  moduleResolution: 'node',
  declaration: true,
  resolveJsonModule: true,
  jsx: 'react'
};

module.exports = tsconfig;
