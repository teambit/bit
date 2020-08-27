export const getStencilConfigFile = () => {
  const config = `import { Config } from '@stencil/core';
import { sass } from '@stencil/sass';
export const config: Config = {
  taskQueue: 'async',
  outputTargets: [
    {
      type: 'dist',
      esmLoaderPath: '../loader'
    },
    {
      type: 'docs-readme'
    },
    {
      type: 'www',
      serviceWorker: null // disable service workers
    }
  ],
  plugins: [sass()]
};`;
  return config;
};
