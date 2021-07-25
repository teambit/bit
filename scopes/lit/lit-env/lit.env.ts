import { merge } from 'lodash';
import { DependenciesEnv } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';

const defaultTsConfig = require('./typescript/tsconfig.json');

export class LitEnv implements DependenciesEnv {
  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';


  getDependencies(): VariantPolicyConfigObject {
    return {
      devDependencies: {
        '@types/jest': '26.0.20',
        '@types/node': '12.20.4',
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '7.12.18',
        "extract-loader": "5.1.0",
        "lit-scss-loader": "1.1.0",
        "css-loader": "5.2.6",
        "sass-loader": "12.0.0",
        "lit": "2.0.0-rc.2",
        "node-sass": "^5.0.0"
      },
    };
  }
}
