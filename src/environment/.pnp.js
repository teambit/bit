#!/usr/bin/env node

/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, null, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const { statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync } = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const ignorePattern = null ? new RegExp(null) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = { name: null, reference: null };
const blacklistedLocator = { name: NaN, reference: NaN };

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = new Map();
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}\//;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?!\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, { code, data });
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`
      ].join(` `)
    );
  }

  return locator;
}

let packageInformationStores = new Map([
  [
    'babel-jest',
    new Map([
      [
        'pnp:763735a22481aea702b7b991000ae4ff3edf6e9b',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-763735a22481aea702b7b991000ae4ff3edf6e9b/node_modules/babel-jest/'
          ),
          packageDependencies: new Map([
            ['babel-core', '7.0.0-bridge.0'],
            ['babel-plugin-istanbul', '4.1.6'],
            ['babel-preset-jest', '23.2.0'],
            ['babel-jest', 'pnp:763735a22481aea702b7b991000ae4ff3edf6e9b']
          ])
        }
      ],
      [
        'pnp:c4ef49fe71ca03400d1cf69604c420f6d409b4d1',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-c4ef49fe71ca03400d1cf69604c420f6d409b4d1/node_modules/babel-jest/'
          ),
          packageDependencies: new Map([
            ['babel-core', '6.26.3'],
            ['babel-plugin-istanbul', '4.1.6'],
            ['babel-preset-jest', '23.2.0'],
            ['babel-jest', 'pnp:c4ef49fe71ca03400d1cf69604c420f6d409b4d1']
          ])
        }
      ]
    ])
  ],
  [
    'babel-plugin-istanbul',
    new Map([
      [
        '4.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-plugin-istanbul-4.1.6-36c59b2192efce81c5b378321b74175add1c9a45/node_modules/babel-plugin-istanbul/'
          ),
          packageDependencies: new Map([
            ['babel-plugin-syntax-object-rest-spread', '6.13.0'],
            ['find-up', '2.1.0'],
            ['istanbul-lib-instrument', '1.10.2'],
            ['test-exclude', '4.2.3'],
            ['babel-plugin-istanbul', '4.1.6']
          ])
        }
      ]
    ])
  ],
  [
    'babel-plugin-syntax-object-rest-spread',
    new Map([
      [
        '6.13.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-plugin-syntax-object-rest-spread-6.13.0-fd6536f2bce13836ffa3a5458c4903a597bb3bf5/node_modules/babel-plugin-syntax-object-rest-spread/'
          ),
          packageDependencies: new Map([['babel-plugin-syntax-object-rest-spread', '6.13.0']])
        }
      ]
    ])
  ],
  [
    'find-up',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-find-up-2.1.0-45d1b7e506c717ddd482775a2b77920a3c0c57a7/node_modules/find-up/'
          ),
          packageDependencies: new Map([['locate-path', '2.0.0'], ['find-up', '2.1.0']])
        }
      ],
      [
        '1.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-find-up-1.1.2-6b2e9822b1a2ce0a60ab64d610eccad53cb24d0f/node_modules/find-up/'
          ),
          packageDependencies: new Map([['path-exists', '2.1.0'], ['pinkie-promise', '2.0.1'], ['find-up', '1.1.2']])
        }
      ]
    ])
  ],
  [
    'locate-path',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-locate-path-2.0.0-2b568b265eec944c6d9c0de9c3dbbbca0354cd8e/node_modules/locate-path/'
          ),
          packageDependencies: new Map([['p-locate', '2.0.0'], ['path-exists', '3.0.0'], ['locate-path', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'p-locate',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-p-locate-2.0.0-20a0103b222a70c8fd39cc2e580680f3dde5ec43/node_modules/p-locate/'
          ),
          packageDependencies: new Map([['p-limit', '1.3.0'], ['p-locate', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'p-limit',
    new Map([
      [
        '1.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-p-limit-1.3.0-b86bd5f0c25690911c7590fcbfc2010d54b3ccb8/node_modules/p-limit/'
          ),
          packageDependencies: new Map([['p-try', '1.0.0'], ['p-limit', '1.3.0']])
        }
      ]
    ])
  ],
  [
    'p-try',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-p-try-1.0.0-cbc79cdbaf8fd4228e13f621f2b1a237c1b207b3/node_modules/p-try/'
          ),
          packageDependencies: new Map([['p-try', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'path-exists',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/'
          ),
          packageDependencies: new Map([['path-exists', '3.0.0']])
        }
      ],
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-path-exists-2.1.0-0feb6c64f0fc518d9a754dd5efb62c7022761f4b/node_modules/path-exists/'
          ),
          packageDependencies: new Map([['pinkie-promise', '2.0.1'], ['path-exists', '2.1.0']])
        }
      ]
    ])
  ],
  [
    'istanbul-lib-instrument',
    new Map([
      [
        '1.10.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-instrument-1.10.2-1f55ed10ac3c47f2bdddd5307935126754d0a9ca/node_modules/istanbul-lib-instrument/'
          ),
          packageDependencies: new Map([
            ['babel-generator', '6.26.1'],
            ['babel-template', '6.26.0'],
            ['babel-traverse', '6.26.0'],
            ['babel-types', '6.26.0'],
            ['babylon', '6.18.0'],
            ['istanbul-lib-coverage', '1.2.1'],
            ['semver', '5.6.0'],
            ['istanbul-lib-instrument', '1.10.2']
          ])
        }
      ]
    ])
  ],
  [
    'babel-generator',
    new Map([
      [
        '6.26.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-generator-6.26.1-1844408d3b8f0d35a404ea7ac180f087a601bd90/node_modules/babel-generator/'
          ),
          packageDependencies: new Map([
            ['babel-messages', '6.23.0'],
            ['babel-runtime', '6.26.0'],
            ['babel-types', '6.26.0'],
            ['detect-indent', '4.0.0'],
            ['jsesc', '1.3.0'],
            ['lodash', '4.17.11'],
            ['source-map', '0.5.7'],
            ['trim-right', '1.0.1'],
            ['babel-generator', '6.26.1']
          ])
        }
      ]
    ])
  ],
  [
    'babel-messages',
    new Map([
      [
        '6.23.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-messages-6.23.0-f3cdf4703858035b2a2951c6ec5edf6c62f2630e/node_modules/babel-messages/'
          ),
          packageDependencies: new Map([['babel-runtime', '6.26.0'], ['babel-messages', '6.23.0']])
        }
      ]
    ])
  ],
  [
    'babel-runtime',
    new Map([
      [
        '6.26.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-runtime-6.26.0-965c7058668e82b55d7bfe04ff2337bc8b5647fe/node_modules/babel-runtime/'
          ),
          packageDependencies: new Map([
            ['core-js', '2.5.7'],
            ['regenerator-runtime', '0.11.1'],
            ['babel-runtime', '6.26.0']
          ])
        }
      ]
    ])
  ],
  [
    'core-js',
    new Map([
      [
        '2.5.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-core-js-2.5.7-f972608ff0cead68b841a16a932d0b183791814e/node_modules/core-js/'
          ),
          packageDependencies: new Map([['core-js', '2.5.7']])
        }
      ]
    ])
  ],
  [
    'regenerator-runtime',
    new Map([
      [
        '0.11.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regenerator-runtime-0.11.1-be05ad7f9bf7d22e056f9726cee5017fbf19e2e9/node_modules/regenerator-runtime/'
          ),
          packageDependencies: new Map([['regenerator-runtime', '0.11.1']])
        }
      ]
    ])
  ],
  [
    'babel-types',
    new Map([
      [
        '6.26.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-types-6.26.0-a3b073f94ab49eb6fa55cd65227a334380632497/node_modules/babel-types/'
          ),
          packageDependencies: new Map([
            ['babel-runtime', '6.26.0'],
            ['esutils', '2.0.2'],
            ['lodash', '4.17.11'],
            ['to-fast-properties', '1.0.3'],
            ['babel-types', '6.26.0']
          ])
        }
      ]
    ])
  ],
  [
    'esutils',
    new Map([
      [
        '2.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-esutils-2.0.2-0abf4f1caa5bcb1f7a9d8acc6dea4faaa04bac9b/node_modules/esutils/'
          ),
          packageDependencies: new Map([['esutils', '2.0.2']])
        }
      ]
    ])
  ],
  [
    'lodash',
    new Map([
      [
        '4.17.11',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/'
          ),
          packageDependencies: new Map([['lodash', '4.17.11']])
        }
      ]
    ])
  ],
  [
    'to-fast-properties',
    new Map([
      [
        '1.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-to-fast-properties-1.0.3-b83571fa4d8c25b82e231b06e3a3055de4ca1a47/node_modules/to-fast-properties/'
          ),
          packageDependencies: new Map([['to-fast-properties', '1.0.3']])
        }
      ],
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-to-fast-properties-2.0.0-dc5e698cbd079265bc73e0377681a4e4e83f616e/node_modules/to-fast-properties/'
          ),
          packageDependencies: new Map([['to-fast-properties', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'detect-indent',
    new Map([
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-detect-indent-4.0.0-f76d064352cdf43a1cb6ce619c4ee3a9475de208/node_modules/detect-indent/'
          ),
          packageDependencies: new Map([['repeating', '2.0.1'], ['detect-indent', '4.0.0']])
        }
      ]
    ])
  ],
  [
    'repeating',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-repeating-2.0.1-5214c53a926d3552707527fbab415dbc08d06dda/node_modules/repeating/'
          ),
          packageDependencies: new Map([['is-finite', '1.0.2'], ['repeating', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'is-finite',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-finite-1.0.2-cc6677695602be550ef11e8b4aa6305342b6d0aa/node_modules/is-finite/'
          ),
          packageDependencies: new Map([['number-is-nan', '1.0.1'], ['is-finite', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'number-is-nan',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/'
          ),
          packageDependencies: new Map([['number-is-nan', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'jsesc',
    new Map([
      [
        '1.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jsesc-1.3.0-46c3fec8c1892b12b0833db9bc7622176dbab34b/node_modules/jsesc/'
          ),
          packageDependencies: new Map([['jsesc', '1.3.0']])
        }
      ],
      [
        '2.5.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jsesc-2.5.2-80564d2e483dacf6e8ef209650a67df3f0c283a4/node_modules/jsesc/'
          ),
          packageDependencies: new Map([['jsesc', '2.5.2']])
        }
      ],
      [
        '0.5.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jsesc-0.5.0-e7dee66e35d6fc16f710fe91d5cf69f70f08911d/node_modules/jsesc/'
          ),
          packageDependencies: new Map([['jsesc', '0.5.0']])
        }
      ]
    ])
  ],
  [
    'source-map',
    new Map([
      [
        '0.5.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/'
          ),
          packageDependencies: new Map([['source-map', '0.5.7']])
        }
      ],
      [
        '0.6.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-source-map-0.6.1-74722af32e9614e9c287a8d0bbde48b5e2f1a263/node_modules/source-map/'
          ),
          packageDependencies: new Map([['source-map', '0.6.1']])
        }
      ]
    ])
  ],
  [
    'trim-right',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-trim-right-1.0.1-cb2e1203067e0c8de1f614094b9fe45704ea6003/node_modules/trim-right/'
          ),
          packageDependencies: new Map([['trim-right', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'babel-template',
    new Map([
      [
        '6.26.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-template-6.26.0-de03e2d16396b069f46dd9fff8521fb1a0e35e02/node_modules/babel-template/'
          ),
          packageDependencies: new Map([
            ['babel-runtime', '6.26.0'],
            ['babel-traverse', '6.26.0'],
            ['babel-types', '6.26.0'],
            ['babylon', '6.18.0'],
            ['lodash', '4.17.11'],
            ['babel-template', '6.26.0']
          ])
        }
      ]
    ])
  ],
  [
    'babel-traverse',
    new Map([
      [
        '6.26.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-traverse-6.26.0-46a9cbd7edcc62c8e5c064e2d2d8d0f4035766ee/node_modules/babel-traverse/'
          ),
          packageDependencies: new Map([
            ['babel-code-frame', '6.26.0'],
            ['babel-messages', '6.23.0'],
            ['babel-runtime', '6.26.0'],
            ['babel-types', '6.26.0'],
            ['babylon', '6.18.0'],
            ['debug', '2.6.9'],
            ['globals', '9.18.0'],
            ['invariant', '2.2.4'],
            ['lodash', '4.17.11'],
            ['babel-traverse', '6.26.0']
          ])
        }
      ]
    ])
  ],
  [
    'babel-code-frame',
    new Map([
      [
        '6.26.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-code-frame-6.26.0-63fd43f7dc1e3bb7ce35947db8fe369a3f58c74b/node_modules/babel-code-frame/'
          ),
          packageDependencies: new Map([
            ['chalk', '1.1.3'],
            ['esutils', '2.0.2'],
            ['js-tokens', '3.0.2'],
            ['babel-code-frame', '6.26.0']
          ])
        }
      ]
    ])
  ],
  [
    'chalk',
    new Map([
      [
        '1.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-chalk-1.1.3-a8115c55e4a702fe4d150abd3872822a7e09fc98/node_modules/chalk/'
          ),
          packageDependencies: new Map([
            ['ansi-styles', '2.2.1'],
            ['escape-string-regexp', '1.0.5'],
            ['has-ansi', '2.0.0'],
            ['strip-ansi', '3.0.1'],
            ['supports-color', '2.0.0'],
            ['chalk', '1.1.3']
          ])
        }
      ],
      [
        '2.4.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-chalk-2.4.1-18c49ab16a037b6eb0152cc83e3471338215b66e/node_modules/chalk/'
          ),
          packageDependencies: new Map([
            ['ansi-styles', '3.2.1'],
            ['escape-string-regexp', '1.0.5'],
            ['supports-color', '5.5.0'],
            ['chalk', '2.4.1']
          ])
        }
      ]
    ])
  ],
  [
    'ansi-styles',
    new Map([
      [
        '2.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ansi-styles-2.2.1-b432dd3358b634cf75e1e4664368240533c1ddbe/node_modules/ansi-styles/'
          ),
          packageDependencies: new Map([['ansi-styles', '2.2.1']])
        }
      ],
      [
        '3.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/'
          ),
          packageDependencies: new Map([['color-convert', '1.9.3'], ['ansi-styles', '3.2.1']])
        }
      ]
    ])
  ],
  [
    'escape-string-regexp',
    new Map([
      [
        '1.0.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/'
          ),
          packageDependencies: new Map([['escape-string-regexp', '1.0.5']])
        }
      ]
    ])
  ],
  [
    'has-ansi',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-ansi-2.0.0-34f5049ce1ecdf2b0649af3ef24e45ed35416d91/node_modules/has-ansi/'
          ),
          packageDependencies: new Map([['ansi-regex', '2.1.1'], ['has-ansi', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'ansi-regex',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/'
          ),
          packageDependencies: new Map([['ansi-regex', '2.1.1']])
        }
      ],
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/'
          ),
          packageDependencies: new Map([['ansi-regex', '3.0.0']])
        }
      ]
    ])
  ],
  [
    'strip-ansi',
    new Map([
      [
        '3.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/'
          ),
          packageDependencies: new Map([['ansi-regex', '2.1.1'], ['strip-ansi', '3.0.1']])
        }
      ],
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/'
          ),
          packageDependencies: new Map([['ansi-regex', '3.0.0'], ['strip-ansi', '4.0.0']])
        }
      ]
    ])
  ],
  [
    'supports-color',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-supports-color-2.0.0-535d045ce6b6363fa40117084629995e9df324c7/node_modules/supports-color/'
          ),
          packageDependencies: new Map([['supports-color', '2.0.0']])
        }
      ],
      [
        '5.5.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/'
          ),
          packageDependencies: new Map([['has-flag', '3.0.0'], ['supports-color', '5.5.0']])
        }
      ],
      [
        '3.2.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-supports-color-3.2.3-65ac0504b3954171d8a64946b2ae3cbb8a5f54f6/node_modules/supports-color/'
          ),
          packageDependencies: new Map([['has-flag', '1.0.0'], ['supports-color', '3.2.3']])
        }
      ]
    ])
  ],
  [
    'js-tokens',
    new Map([
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-js-tokens-3.0.2-9866df395102130e38f7f996bceb65443209c25b/node_modules/js-tokens/'
          ),
          packageDependencies: new Map([['js-tokens', '3.0.2']])
        }
      ],
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/'
          ),
          packageDependencies: new Map([['js-tokens', '4.0.0']])
        }
      ]
    ])
  ],
  [
    'babylon',
    new Map([
      [
        '6.18.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babylon-6.18.0-af2f3b88fa6f5c1e4c634d1a0f8eac4f55b395e3/node_modules/babylon/'
          ),
          packageDependencies: new Map([['babylon', '6.18.0']])
        }
      ]
    ])
  ],
  [
    'debug',
    new Map([
      [
        '2.6.9',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/'
          ),
          packageDependencies: new Map([['ms', '2.0.0'], ['debug', '2.6.9']])
        }
      ],
      [
        '3.2.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-debug-3.2.6-e83d17de16d8a7efb7717edbe5fb10135eee629b/node_modules/debug/'
          ),
          packageDependencies: new Map([['ms', '2.1.1'], ['debug', '3.2.6']])
        }
      ],
      [
        '4.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-debug-4.1.0-373687bffa678b38b1cd91f861b63850035ddc87/node_modules/debug/'
          ),
          packageDependencies: new Map([['ms', '2.1.1'], ['debug', '4.1.0']])
        }
      ]
    ])
  ],
  [
    'ms',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/'
          ),
          packageDependencies: new Map([['ms', '2.0.0']])
        }
      ],
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ms-2.1.1-30a5864eb3ebb0a66f2ebe6d727af06a09d86e0a/node_modules/ms/'
          ),
          packageDependencies: new Map([['ms', '2.1.1']])
        }
      ]
    ])
  ],
  [
    'globals',
    new Map([
      [
        '9.18.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-globals-9.18.0-aa3896b3e69b487f17e31ed2143d69a8e30c2d8a/node_modules/globals/'
          ),
          packageDependencies: new Map([['globals', '9.18.0']])
        }
      ],
      [
        '11.9.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-globals-11.9.0-bde236808e987f290768a93d065060d78e6ab249/node_modules/globals/'
          ),
          packageDependencies: new Map([['globals', '11.9.0']])
        }
      ]
    ])
  ],
  [
    'invariant',
    new Map([
      [
        '2.2.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-invariant-2.2.4-610f3c92c9359ce1db616e538008d23ff35158e6/node_modules/invariant/'
          ),
          packageDependencies: new Map([['loose-envify', '1.4.0'], ['invariant', '2.2.4']])
        }
      ]
    ])
  ],
  [
    'loose-envify',
    new Map([
      [
        '1.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-loose-envify-1.4.0-71ee51fa7be4caec1a63839f7e682d8132d30caf/node_modules/loose-envify/'
          ),
          packageDependencies: new Map([['js-tokens', '4.0.0'], ['loose-envify', '1.4.0']])
        }
      ]
    ])
  ],
  [
    'istanbul-lib-coverage',
    new Map([
      [
        '1.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-coverage-1.2.1-ccf7edcd0a0bb9b8f729feeb0930470f9af664f0/node_modules/istanbul-lib-coverage/'
          ),
          packageDependencies: new Map([['istanbul-lib-coverage', '1.2.1']])
        }
      ]
    ])
  ],
  [
    'semver',
    new Map([
      [
        '5.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-semver-5.6.0-7e74256fbaa49c75aa7c7a205cc22799cac80004/node_modules/semver/'
          ),
          packageDependencies: new Map([['semver', '5.6.0']])
        }
      ]
    ])
  ],
  [
    'test-exclude',
    new Map([
      [
        '4.2.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-test-exclude-4.2.3-a9a5e64474e4398339245a0a769ad7c2f4a97c20/node_modules/test-exclude/'
          ),
          packageDependencies: new Map([
            ['arrify', '1.0.1'],
            ['micromatch', '2.3.11'],
            ['object-assign', '4.1.1'],
            ['read-pkg-up', '1.0.1'],
            ['require-main-filename', '1.0.1'],
            ['test-exclude', '4.2.3']
          ])
        }
      ]
    ])
  ],
  [
    'arrify',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-arrify-1.0.1-898508da2226f380df904728456849c1501a4b0d/node_modules/arrify/'
          ),
          packageDependencies: new Map([['arrify', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'micromatch',
    new Map([
      [
        '2.3.11',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-micromatch-2.3.11-86677c97d1720b363431d04d0d15293bd38c1565/node_modules/micromatch/'
          ),
          packageDependencies: new Map([
            ['arr-diff', '2.0.0'],
            ['array-unique', '0.2.1'],
            ['braces', '1.8.5'],
            ['expand-brackets', '0.1.5'],
            ['extglob', '0.3.2'],
            ['filename-regex', '2.0.1'],
            ['is-extglob', '1.0.0'],
            ['is-glob', '2.0.1'],
            ['kind-of', '3.2.2'],
            ['normalize-path', '2.1.1'],
            ['object.omit', '2.0.1'],
            ['parse-glob', '3.0.4'],
            ['regex-cache', '0.4.4'],
            ['micromatch', '2.3.11']
          ])
        }
      ],
      [
        '3.1.10',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/'
          ),
          packageDependencies: new Map([
            ['arr-diff', '4.0.0'],
            ['array-unique', '0.3.2'],
            ['braces', '2.3.2'],
            ['define-property', '2.0.2'],
            ['extend-shallow', '3.0.2'],
            ['extglob', '2.0.4'],
            ['fragment-cache', '0.2.1'],
            ['kind-of', '6.0.2'],
            ['nanomatch', '1.2.13'],
            ['object.pick', '1.3.0'],
            ['regex-not', '1.0.2'],
            ['snapdragon', '0.8.2'],
            ['to-regex', '3.0.2'],
            ['micromatch', '3.1.10']
          ])
        }
      ]
    ])
  ],
  [
    'arr-diff',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-arr-diff-2.0.0-8f3b827f955a8bd669697e4a4256ac3ceae356cf/node_modules/arr-diff/'
          ),
          packageDependencies: new Map([['arr-flatten', '1.1.0'], ['arr-diff', '2.0.0']])
        }
      ],
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/'
          ),
          packageDependencies: new Map([['arr-diff', '4.0.0']])
        }
      ]
    ])
  ],
  [
    'arr-flatten',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/'
          ),
          packageDependencies: new Map([['arr-flatten', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'array-unique',
    new Map([
      [
        '0.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-array-unique-0.2.1-a1d97ccafcbc2625cc70fadceb36a50c58b01a53/node_modules/array-unique/'
          ),
          packageDependencies: new Map([['array-unique', '0.2.1']])
        }
      ],
      [
        '0.3.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/'
          ),
          packageDependencies: new Map([['array-unique', '0.3.2']])
        }
      ]
    ])
  ],
  [
    'braces',
    new Map([
      [
        '1.8.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-braces-1.8.5-ba77962e12dff969d6b76711e914b737857bf6a7/node_modules/braces/'
          ),
          packageDependencies: new Map([
            ['expand-range', '1.8.2'],
            ['preserve', '0.2.0'],
            ['repeat-element', '1.1.3'],
            ['braces', '1.8.5']
          ])
        }
      ],
      [
        '2.3.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/'
          ),
          packageDependencies: new Map([
            ['arr-flatten', '1.1.0'],
            ['array-unique', '0.3.2'],
            ['extend-shallow', '2.0.1'],
            ['fill-range', '4.0.0'],
            ['isobject', '3.0.1'],
            ['repeat-element', '1.1.3'],
            ['snapdragon', '0.8.2'],
            ['snapdragon-node', '2.1.1'],
            ['split-string', '3.1.0'],
            ['to-regex', '3.0.2'],
            ['braces', '2.3.2']
          ])
        }
      ]
    ])
  ],
  [
    'expand-range',
    new Map([
      [
        '1.8.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-expand-range-1.8.2-a299effd335fe2721ebae8e257ec79644fc85337/node_modules/expand-range/'
          ),
          packageDependencies: new Map([['fill-range', '2.2.4'], ['expand-range', '1.8.2']])
        }
      ]
    ])
  ],
  [
    'fill-range',
    new Map([
      [
        '2.2.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fill-range-2.2.4-eb1e773abb056dcd8df2bfdf6af59b8b3a936565/node_modules/fill-range/'
          ),
          packageDependencies: new Map([
            ['is-number', '2.1.0'],
            ['isobject', '2.1.0'],
            ['randomatic', '3.1.1'],
            ['repeat-element', '1.1.3'],
            ['repeat-string', '1.6.1'],
            ['fill-range', '2.2.4']
          ])
        }
      ],
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/'
          ),
          packageDependencies: new Map([
            ['extend-shallow', '2.0.1'],
            ['is-number', '3.0.0'],
            ['repeat-string', '1.6.1'],
            ['to-regex-range', '2.1.1'],
            ['fill-range', '4.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'is-number',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-number-2.1.0-01fcbbb393463a548f2f466cce16dece49db908f/node_modules/is-number/'
          ),
          packageDependencies: new Map([['kind-of', '3.2.2'], ['is-number', '2.1.0']])
        }
      ],
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-number-4.0.0-0026e37f5454d73e356dfe6564699867c6a7f0ff/node_modules/is-number/'
          ),
          packageDependencies: new Map([['is-number', '4.0.0']])
        }
      ],
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/'
          ),
          packageDependencies: new Map([['kind-of', '3.2.2'], ['is-number', '3.0.0']])
        }
      ]
    ])
  ],
  [
    'kind-of',
    new Map([
      [
        '3.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/'
          ),
          packageDependencies: new Map([['is-buffer', '1.1.6'], ['kind-of', '3.2.2']])
        }
      ],
      [
        '6.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/'
          ),
          packageDependencies: new Map([['kind-of', '6.0.2']])
        }
      ],
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/'
          ),
          packageDependencies: new Map([['is-buffer', '1.1.6'], ['kind-of', '4.0.0']])
        }
      ],
      [
        '5.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/'
          ),
          packageDependencies: new Map([['kind-of', '5.1.0']])
        }
      ]
    ])
  ],
  [
    'is-buffer',
    new Map([
      [
        '1.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/'
          ),
          packageDependencies: new Map([['is-buffer', '1.1.6']])
        }
      ]
    ])
  ],
  [
    'isobject',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/'
          ),
          packageDependencies: new Map([['isarray', '1.0.0'], ['isobject', '2.1.0']])
        }
      ],
      [
        '3.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/'
          ),
          packageDependencies: new Map([['isobject', '3.0.1']])
        }
      ]
    ])
  ],
  [
    'isarray',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/'
          ),
          packageDependencies: new Map([['isarray', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'randomatic',
    new Map([
      [
        '3.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-randomatic-3.1.1-b776efc59375984e36c537b2f51a1f0aff0da1ed/node_modules/randomatic/'
          ),
          packageDependencies: new Map([
            ['is-number', '4.0.0'],
            ['kind-of', '6.0.2'],
            ['math-random', '1.0.1'],
            ['randomatic', '3.1.1']
          ])
        }
      ]
    ])
  ],
  [
    'math-random',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-math-random-1.0.1-8b3aac588b8a66e4975e3cdea67f7bb329601fac/node_modules/math-random/'
          ),
          packageDependencies: new Map([['math-random', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'repeat-element',
    new Map([
      [
        '1.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/'
          ),
          packageDependencies: new Map([['repeat-element', '1.1.3']])
        }
      ]
    ])
  ],
  [
    'repeat-string',
    new Map([
      [
        '1.6.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/'
          ),
          packageDependencies: new Map([['repeat-string', '1.6.1']])
        }
      ]
    ])
  ],
  [
    'preserve',
    new Map([
      [
        '0.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-preserve-0.2.0-815ed1f6ebc65926f865b310c0713bcb3315ce4b/node_modules/preserve/'
          ),
          packageDependencies: new Map([['preserve', '0.2.0']])
        }
      ]
    ])
  ],
  [
    'expand-brackets',
    new Map([
      [
        '0.1.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-expand-brackets-0.1.5-df07284e342a807cd733ac5af72411e581d1177b/node_modules/expand-brackets/'
          ),
          packageDependencies: new Map([['is-posix-bracket', '0.1.1'], ['expand-brackets', '0.1.5']])
        }
      ],
      [
        '2.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/'
          ),
          packageDependencies: new Map([
            ['debug', '2.6.9'],
            ['define-property', '0.2.5'],
            ['extend-shallow', '2.0.1'],
            ['posix-character-classes', '0.1.1'],
            ['regex-not', '1.0.2'],
            ['snapdragon', '0.8.2'],
            ['to-regex', '3.0.2'],
            ['expand-brackets', '2.1.4']
          ])
        }
      ]
    ])
  ],
  [
    'is-posix-bracket',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-posix-bracket-0.1.1-3334dc79774368e92f016e6fbc0a88f5cd6e6bc4/node_modules/is-posix-bracket/'
          ),
          packageDependencies: new Map([['is-posix-bracket', '0.1.1']])
        }
      ]
    ])
  ],
  [
    'extglob',
    new Map([
      [
        '0.3.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extglob-0.3.2-2e18ff3d2f49ab2765cec9023f011daa8d8349a1/node_modules/extglob/'
          ),
          packageDependencies: new Map([['is-extglob', '1.0.0'], ['extglob', '0.3.2']])
        }
      ],
      [
        '2.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/'
          ),
          packageDependencies: new Map([
            ['array-unique', '0.3.2'],
            ['define-property', '1.0.0'],
            ['expand-brackets', '2.1.4'],
            ['extend-shallow', '2.0.1'],
            ['fragment-cache', '0.2.1'],
            ['regex-not', '1.0.2'],
            ['snapdragon', '0.8.2'],
            ['to-regex', '3.0.2'],
            ['extglob', '2.0.4']
          ])
        }
      ]
    ])
  ],
  [
    'is-extglob',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-extglob-1.0.0-ac468177c4943405a092fc8f29760c6ffc6206c0/node_modules/is-extglob/'
          ),
          packageDependencies: new Map([['is-extglob', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'filename-regex',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-filename-regex-2.0.1-c1c4b9bee3e09725ddb106b75c1e301fe2f18b26/node_modules/filename-regex/'
          ),
          packageDependencies: new Map([['filename-regex', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'is-glob',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-glob-2.0.1-d096f926a3ded5600f3fdfd91198cb0888c2d863/node_modules/is-glob/'
          ),
          packageDependencies: new Map([['is-extglob', '1.0.0'], ['is-glob', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'normalize-path',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/'
          ),
          packageDependencies: new Map([['remove-trailing-separator', '1.1.0'], ['normalize-path', '2.1.1']])
        }
      ]
    ])
  ],
  [
    'remove-trailing-separator',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/'
          ),
          packageDependencies: new Map([['remove-trailing-separator', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'object.omit',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-omit-2.0.1-1a9c744829f39dbb858c76ca3579ae2a54ebd1fa/node_modules/object.omit/'
          ),
          packageDependencies: new Map([['for-own', '0.1.5'], ['is-extendable', '0.1.1'], ['object.omit', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'for-own',
    new Map([
      [
        '0.1.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-for-own-0.1.5-5265c681a4f294dabbf17c9509b6763aa84510ce/node_modules/for-own/'
          ),
          packageDependencies: new Map([['for-in', '1.0.2'], ['for-own', '0.1.5']])
        }
      ]
    ])
  ],
  [
    'for-in',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/'
          ),
          packageDependencies: new Map([['for-in', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'is-extendable',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/'
          ),
          packageDependencies: new Map([['is-extendable', '0.1.1']])
        }
      ],
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/'
          ),
          packageDependencies: new Map([['is-plain-object', '2.0.4'], ['is-extendable', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'parse-glob',
    new Map([
      [
        '3.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-parse-glob-3.0.4-b2c376cfb11f35513badd173ef0bb6e3a388391c/node_modules/parse-glob/'
          ),
          packageDependencies: new Map([
            ['glob-base', '0.3.0'],
            ['is-dotfile', '1.0.3'],
            ['is-extglob', '1.0.0'],
            ['is-glob', '2.0.1'],
            ['parse-glob', '3.0.4']
          ])
        }
      ]
    ])
  ],
  [
    'glob-base',
    new Map([
      [
        '0.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-glob-base-0.3.0-dbb164f6221b1c0b1ccf82aea328b497df0ea3c4/node_modules/glob-base/'
          ),
          packageDependencies: new Map([['glob-parent', '2.0.0'], ['is-glob', '2.0.1'], ['glob-base', '0.3.0']])
        }
      ]
    ])
  ],
  [
    'glob-parent',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-glob-parent-2.0.0-81383d72db054fcccf5336daa902f182f6edbb28/node_modules/glob-parent/'
          ),
          packageDependencies: new Map([['is-glob', '2.0.1'], ['glob-parent', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'is-dotfile',
    new Map([
      [
        '1.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-dotfile-1.0.3-a6a2f32ffd2dfb04f5ca25ecd0f6b83cf798a1e1/node_modules/is-dotfile/'
          ),
          packageDependencies: new Map([['is-dotfile', '1.0.3']])
        }
      ]
    ])
  ],
  [
    'regex-cache',
    new Map([
      [
        '0.4.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regex-cache-0.4.4-75bdc58a2a1496cec48a12835bc54c8d562336dd/node_modules/regex-cache/'
          ),
          packageDependencies: new Map([['is-equal-shallow', '0.1.3'], ['regex-cache', '0.4.4']])
        }
      ]
    ])
  ],
  [
    'is-equal-shallow',
    new Map([
      [
        '0.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-equal-shallow-0.1.3-2238098fc221de0bcfa5d9eac4c45d638aa1c534/node_modules/is-equal-shallow/'
          ),
          packageDependencies: new Map([['is-primitive', '2.0.0'], ['is-equal-shallow', '0.1.3']])
        }
      ]
    ])
  ],
  [
    'is-primitive',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-primitive-2.0.0-207bab91638499c07b2adf240a41a87210034575/node_modules/is-primitive/'
          ),
          packageDependencies: new Map([['is-primitive', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'object-assign',
    new Map([
      [
        '4.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/'
          ),
          packageDependencies: new Map([['object-assign', '4.1.1']])
        }
      ]
    ])
  ],
  [
    'read-pkg-up',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-read-pkg-up-1.0.1-9d63c13276c065918d57f002a57f40a1b643fb02/node_modules/read-pkg-up/'
          ),
          packageDependencies: new Map([['find-up', '1.1.2'], ['read-pkg', '1.1.0'], ['read-pkg-up', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'pinkie-promise',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pinkie-promise-2.0.1-2135d6dfa7a358c069ac9b178776288228450ffa/node_modules/pinkie-promise/'
          ),
          packageDependencies: new Map([['pinkie', '2.0.4'], ['pinkie-promise', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'pinkie',
    new Map([
      [
        '2.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pinkie-2.0.4-72556b80cfa0d48a974e80e77248e80ed4f7f870/node_modules/pinkie/'
          ),
          packageDependencies: new Map([['pinkie', '2.0.4']])
        }
      ]
    ])
  ],
  [
    'read-pkg',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-read-pkg-1.1.0-f5ffaa5ecd29cb31c0474bca7d756b6bb29e3f28/node_modules/read-pkg/'
          ),
          packageDependencies: new Map([
            ['load-json-file', '1.1.0'],
            ['normalize-package-data', '2.4.0'],
            ['path-type', '1.1.0'],
            ['read-pkg', '1.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'load-json-file',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-load-json-file-1.1.0-956905708d58b4bab4c2261b04f59f31c99374c0/node_modules/load-json-file/'
          ),
          packageDependencies: new Map([
            ['graceful-fs', '4.1.15'],
            ['parse-json', '2.2.0'],
            ['pify', '2.3.0'],
            ['pinkie-promise', '2.0.1'],
            ['strip-bom', '2.0.0'],
            ['load-json-file', '1.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'graceful-fs',
    new Map([
      [
        '4.1.15',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-graceful-fs-4.1.15-ffb703e1066e8a0eeaa4c8b80ba9253eeefbfb00/node_modules/graceful-fs/'
          ),
          packageDependencies: new Map([['graceful-fs', '4.1.15']])
        }
      ]
    ])
  ],
  [
    'parse-json',
    new Map([
      [
        '2.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-parse-json-2.2.0-f480f40434ef80741f8469099f8dea18f55a4dc9/node_modules/parse-json/'
          ),
          packageDependencies: new Map([['error-ex', '1.3.2'], ['parse-json', '2.2.0']])
        }
      ]
    ])
  ],
  [
    'error-ex',
    new Map([
      [
        '1.3.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-error-ex-1.3.2-b4ac40648107fdcdcfae242f428bea8a14d4f1bf/node_modules/error-ex/'
          ),
          packageDependencies: new Map([['is-arrayish', '0.2.1'], ['error-ex', '1.3.2']])
        }
      ]
    ])
  ],
  [
    'is-arrayish',
    new Map([
      [
        '0.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-arrayish-0.2.1-77c99840527aa8ecb1a8ba697b80645a7a926a9d/node_modules/is-arrayish/'
          ),
          packageDependencies: new Map([['is-arrayish', '0.2.1']])
        }
      ]
    ])
  ],
  [
    'pify',
    new Map([
      [
        '2.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pify-2.3.0-ed141a6ac043a849ea588498e7dca8b15330e90c/node_modules/pify/'
          ),
          packageDependencies: new Map([['pify', '2.3.0']])
        }
      ]
    ])
  ],
  [
    'strip-bom',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-strip-bom-2.0.0-6219a85616520491f35788bdbf1447a99c7e6b0e/node_modules/strip-bom/'
          ),
          packageDependencies: new Map([['is-utf8', '0.2.1'], ['strip-bom', '2.0.0']])
        }
      ],
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-strip-bom-3.0.0-2334c18e9c759f7bdd56fdef7e9ae3d588e68ed3/node_modules/strip-bom/'
          ),
          packageDependencies: new Map([['strip-bom', '3.0.0']])
        }
      ]
    ])
  ],
  [
    'is-utf8',
    new Map([
      [
        '0.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-utf8-0.2.1-4b0da1442104d1b336340e80797e865cf39f7d72/node_modules/is-utf8/'
          ),
          packageDependencies: new Map([['is-utf8', '0.2.1']])
        }
      ]
    ])
  ],
  [
    'normalize-package-data',
    new Map([
      [
        '2.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-normalize-package-data-2.4.0-12f95a307d58352075a04907b84ac8be98ac012f/node_modules/normalize-package-data/'
          ),
          packageDependencies: new Map([
            ['hosted-git-info', '2.7.1'],
            ['is-builtin-module', '1.0.0'],
            ['semver', '5.6.0'],
            ['validate-npm-package-license', '3.0.4'],
            ['normalize-package-data', '2.4.0']
          ])
        }
      ]
    ])
  ],
  [
    'hosted-git-info',
    new Map([
      [
        '2.7.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-hosted-git-info-2.7.1-97f236977bd6e125408930ff6de3eec6281ec047/node_modules/hosted-git-info/'
          ),
          packageDependencies: new Map([['hosted-git-info', '2.7.1']])
        }
      ]
    ])
  ],
  [
    'is-builtin-module',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-builtin-module-1.0.0-540572d34f7ac3119f8f76c30cbc1b1e037affbe/node_modules/is-builtin-module/'
          ),
          packageDependencies: new Map([['builtin-modules', '1.1.1'], ['is-builtin-module', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'builtin-modules',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-builtin-modules-1.1.1-270f076c5a72c02f5b65a47df94c5fe3a278892f/node_modules/builtin-modules/'
          ),
          packageDependencies: new Map([['builtin-modules', '1.1.1']])
        }
      ]
    ])
  ],
  [
    'validate-npm-package-license',
    new Map([
      [
        '3.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-validate-npm-package-license-3.0.4-fc91f6b9c7ba15c857f4cb2c5defeec39d4f410a/node_modules/validate-npm-package-license/'
          ),
          packageDependencies: new Map([
            ['spdx-correct', '3.0.2'],
            ['spdx-expression-parse', '3.0.0'],
            ['validate-npm-package-license', '3.0.4']
          ])
        }
      ]
    ])
  ],
  [
    'spdx-correct',
    new Map([
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-spdx-correct-3.0.2-19bb409e91b47b1ad54159243f7312a858db3c2e/node_modules/spdx-correct/'
          ),
          packageDependencies: new Map([
            ['spdx-expression-parse', '3.0.0'],
            ['spdx-license-ids', '3.0.2'],
            ['spdx-correct', '3.0.2']
          ])
        }
      ]
    ])
  ],
  [
    'spdx-expression-parse',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-spdx-expression-parse-3.0.0-99e119b7a5da00e05491c9fa338b7904823b41d0/node_modules/spdx-expression-parse/'
          ),
          packageDependencies: new Map([
            ['spdx-exceptions', '2.2.0'],
            ['spdx-license-ids', '3.0.2'],
            ['spdx-expression-parse', '3.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'spdx-exceptions',
    new Map([
      [
        '2.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-spdx-exceptions-2.2.0-2ea450aee74f2a89bfb94519c07fcd6f41322977/node_modules/spdx-exceptions/'
          ),
          packageDependencies: new Map([['spdx-exceptions', '2.2.0']])
        }
      ]
    ])
  ],
  [
    'spdx-license-ids',
    new Map([
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-spdx-license-ids-3.0.2-a59efc09784c2a5bada13cfeaf5c75dd214044d2/node_modules/spdx-license-ids/'
          ),
          packageDependencies: new Map([['spdx-license-ids', '3.0.2']])
        }
      ]
    ])
  ],
  [
    'path-type',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-path-type-1.1.0-59c44f7ee491da704da415da5a4070ba4f8fe441/node_modules/path-type/'
          ),
          packageDependencies: new Map([
            ['graceful-fs', '4.1.15'],
            ['pify', '2.3.0'],
            ['pinkie-promise', '2.0.1'],
            ['path-type', '1.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'require-main-filename',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-require-main-filename-1.0.1-97f717b69d48784f5f526a6c5aa8ffdda055a4d1/node_modules/require-main-filename/'
          ),
          packageDependencies: new Map([['require-main-filename', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'babel-preset-jest',
    new Map([
      [
        '23.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-preset-jest-23.2.0-8ec7a03a138f001a1a8fb1e8113652bf1a55da46/node_modules/babel-preset-jest/'
          ),
          packageDependencies: new Map([
            ['babel-plugin-jest-hoist', '23.2.0'],
            ['babel-plugin-syntax-object-rest-spread', '6.13.0'],
            ['babel-preset-jest', '23.2.0']
          ])
        }
      ]
    ])
  ],
  [
    'babel-plugin-jest-hoist',
    new Map([
      [
        '23.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-plugin-jest-hoist-23.2.0-e61fae05a1ca8801aadee57a6d66b8cefaf44167/node_modules/babel-plugin-jest-hoist/'
          ),
          packageDependencies: new Map([['babel-plugin-jest-hoist', '23.2.0']])
        }
      ]
    ])
  ],
  [
    'jest-cli',
    new Map([
      [
        '23.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-cli-23.0.0-29287498c9d844dcda5aaf011a4c82f9a888836e/node_modules/jest-cli/'
          ),
          packageDependencies: new Map([
            ['ansi-escapes', '3.1.0'],
            ['chalk', '2.4.1'],
            ['exit', '0.1.2'],
            ['glob', '7.1.3'],
            ['graceful-fs', '4.1.15'],
            ['import-local', '1.0.0'],
            ['is-ci', '1.2.1'],
            ['istanbul-api', '1.3.7'],
            ['istanbul-lib-coverage', '1.2.1'],
            ['istanbul-lib-instrument', '1.10.2'],
            ['istanbul-lib-source-maps', '1.2.6'],
            ['jest-changed-files', '22.4.3'],
            ['jest-config', '23.6.0'],
            ['jest-environment-jsdom', '23.4.0'],
            ['jest-get-type', '22.4.3'],
            ['jest-haste-map', '23.6.0'],
            ['jest-message-util', '23.4.0'],
            ['jest-regex-util', '23.3.0'],
            ['jest-resolve-dependencies', '23.6.0'],
            ['jest-runner', '23.6.0'],
            ['jest-runtime', '23.6.0'],
            ['jest-snapshot', '23.6.0'],
            ['jest-util', '23.4.0'],
            ['jest-validate', '23.6.0'],
            ['jest-worker', '23.2.0'],
            ['micromatch', '2.3.11'],
            ['node-notifier', '5.3.0'],
            ['realpath-native', '1.0.2'],
            ['rimraf', '2.6.2'],
            ['slash', '1.0.0'],
            ['string-length', '2.0.0'],
            ['strip-ansi', '4.0.0'],
            ['which', '1.3.1'],
            ['yargs', '11.1.0'],
            ['jest-cli', '23.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'ansi-escapes',
    new Map([
      [
        '3.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ansi-escapes-3.1.0-f73207bb81207d75fd6c83f125af26eea378ca30/node_modules/ansi-escapes/'
          ),
          packageDependencies: new Map([['ansi-escapes', '3.1.0']])
        }
      ]
    ])
  ],
  [
    'color-convert',
    new Map([
      [
        '1.9.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/'
          ),
          packageDependencies: new Map([['color-name', '1.1.3'], ['color-convert', '1.9.3']])
        }
      ]
    ])
  ],
  [
    'color-name',
    new Map([
      [
        '1.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/'
          ),
          packageDependencies: new Map([['color-name', '1.1.3']])
        }
      ]
    ])
  ],
  [
    'has-flag',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/'
          ),
          packageDependencies: new Map([['has-flag', '3.0.0']])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-flag-1.0.0-9d9e793165ce017a00f00418c43f942a7b1d11fa/node_modules/has-flag/'
          ),
          packageDependencies: new Map([['has-flag', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'exit',
    new Map([
      [
        '0.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-exit-0.1.2-0632638f8d877cc82107d30a0fff1a17cba1cd0c/node_modules/exit/'
          ),
          packageDependencies: new Map([['exit', '0.1.2']])
        }
      ]
    ])
  ],
  [
    'glob',
    new Map([
      [
        '7.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-glob-7.1.3-3960832d3f1574108342dafd3a67b332c0969df1/node_modules/glob/'
          ),
          packageDependencies: new Map([
            ['fs.realpath', '1.0.0'],
            ['inflight', '1.0.6'],
            ['inherits', '2.0.3'],
            ['minimatch', '3.0.4'],
            ['once', '1.4.0'],
            ['path-is-absolute', '1.0.1'],
            ['glob', '7.1.3']
          ])
        }
      ]
    ])
  ],
  [
    'fs.realpath',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/'
          ),
          packageDependencies: new Map([['fs.realpath', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'inflight',
    new Map([
      [
        '1.0.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/'
          ),
          packageDependencies: new Map([['once', '1.4.0'], ['wrappy', '1.0.2'], ['inflight', '1.0.6']])
        }
      ]
    ])
  ],
  [
    'once',
    new Map([
      [
        '1.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/'
          ),
          packageDependencies: new Map([['wrappy', '1.0.2'], ['once', '1.4.0']])
        }
      ]
    ])
  ],
  [
    'wrappy',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/'
          ),
          packageDependencies: new Map([['wrappy', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'inherits',
    new Map([
      [
        '2.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/'
          ),
          packageDependencies: new Map([['inherits', '2.0.3']])
        }
      ]
    ])
  ],
  [
    'minimatch',
    new Map([
      [
        '3.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/'
          ),
          packageDependencies: new Map([['brace-expansion', '1.1.11'], ['minimatch', '3.0.4']])
        }
      ]
    ])
  ],
  [
    'brace-expansion',
    new Map([
      [
        '1.1.11',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/'
          ),
          packageDependencies: new Map([
            ['balanced-match', '1.0.0'],
            ['concat-map', '0.0.1'],
            ['brace-expansion', '1.1.11']
          ])
        }
      ]
    ])
  ],
  [
    'balanced-match',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/'
          ),
          packageDependencies: new Map([['balanced-match', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'concat-map',
    new Map([
      [
        '0.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/'
          ),
          packageDependencies: new Map([['concat-map', '0.0.1']])
        }
      ]
    ])
  ],
  [
    'path-is-absolute',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/'
          ),
          packageDependencies: new Map([['path-is-absolute', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'import-local',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-import-local-1.0.0-5e4ffdc03f4fe6c009c6729beb29631c2f8227bc/node_modules/import-local/'
          ),
          packageDependencies: new Map([['pkg-dir', '2.0.0'], ['resolve-cwd', '2.0.0'], ['import-local', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'pkg-dir',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pkg-dir-2.0.0-f6d5d1109e19d63edf428e0bd57e12777615334b/node_modules/pkg-dir/'
          ),
          packageDependencies: new Map([['find-up', '2.1.0'], ['pkg-dir', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'resolve-cwd',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-resolve-cwd-2.0.0-00a9f7387556e27038eae232caa372a6a59b665a/node_modules/resolve-cwd/'
          ),
          packageDependencies: new Map([['resolve-from', '3.0.0'], ['resolve-cwd', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'resolve-from',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-resolve-from-3.0.0-b22c7af7d9d6881bc8b6e653335eebcb0a188748/node_modules/resolve-from/'
          ),
          packageDependencies: new Map([['resolve-from', '3.0.0']])
        }
      ]
    ])
  ],
  [
    'is-ci',
    new Map([
      [
        '1.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-ci-1.2.1-e3779c8ee17fccf428488f6e281187f2e632841c/node_modules/is-ci/'
          ),
          packageDependencies: new Map([['ci-info', '1.6.0'], ['is-ci', '1.2.1']])
        }
      ]
    ])
  ],
  [
    'ci-info',
    new Map([
      [
        '1.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ci-info-1.6.0-2ca20dbb9ceb32d4524a683303313f0304b1e497/node_modules/ci-info/'
          ),
          packageDependencies: new Map([['ci-info', '1.6.0']])
        }
      ]
    ])
  ],
  [
    'istanbul-api',
    new Map([
      [
        '1.3.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-api-1.3.7-a86c770d2b03e11e3f778cd7aedd82d2722092aa/node_modules/istanbul-api/'
          ),
          packageDependencies: new Map([
            ['async', '2.6.1'],
            ['fileset', '2.0.3'],
            ['istanbul-lib-coverage', '1.2.1'],
            ['istanbul-lib-hook', '1.2.2'],
            ['istanbul-lib-instrument', '1.10.2'],
            ['istanbul-lib-report', '1.1.5'],
            ['istanbul-lib-source-maps', '1.2.6'],
            ['istanbul-reports', '1.5.1'],
            ['js-yaml', '3.12.0'],
            ['mkdirp', '0.5.1'],
            ['once', '1.4.0'],
            ['istanbul-api', '1.3.7']
          ])
        }
      ]
    ])
  ],
  [
    'async',
    new Map([
      [
        '2.6.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-async-2.6.1-b245a23ca71930044ec53fa46aa00a3e87c6a610/node_modules/async/'
          ),
          packageDependencies: new Map([['lodash', '4.17.11'], ['async', '2.6.1']])
        }
      ]
    ])
  ],
  [
    'fileset',
    new Map([
      [
        '2.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fileset-2.0.3-8e7548a96d3cc2327ee5e674168723a333bba2a0/node_modules/fileset/'
          ),
          packageDependencies: new Map([['glob', '7.1.3'], ['minimatch', '3.0.4'], ['fileset', '2.0.3']])
        }
      ]
    ])
  ],
  [
    'istanbul-lib-hook',
    new Map([
      [
        '1.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-hook-1.2.2-bc6bf07f12a641fbf1c85391d0daa8f0aea6bf86/node_modules/istanbul-lib-hook/'
          ),
          packageDependencies: new Map([['append-transform', '0.4.0'], ['istanbul-lib-hook', '1.2.2']])
        }
      ]
    ])
  ],
  [
    'append-transform',
    new Map([
      [
        '0.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-append-transform-0.4.0-d76ebf8ca94d276e247a36bad44a4b74ab611991/node_modules/append-transform/'
          ),
          packageDependencies: new Map([['default-require-extensions', '1.0.0'], ['append-transform', '0.4.0']])
        }
      ]
    ])
  ],
  [
    'default-require-extensions',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-default-require-extensions-1.0.0-f37ea15d3e13ffd9b437d33e1a75b5fb97874cb8/node_modules/default-require-extensions/'
          ),
          packageDependencies: new Map([['strip-bom', '2.0.0'], ['default-require-extensions', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'istanbul-lib-report',
    new Map([
      [
        '1.1.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-report-1.1.5-f2a657fc6282f96170aaf281eb30a458f7f4170c/node_modules/istanbul-lib-report/'
          ),
          packageDependencies: new Map([
            ['istanbul-lib-coverage', '1.2.1'],
            ['mkdirp', '0.5.1'],
            ['path-parse', '1.0.6'],
            ['supports-color', '3.2.3'],
            ['istanbul-lib-report', '1.1.5']
          ])
        }
      ]
    ])
  ],
  [
    'mkdirp',
    new Map([
      [
        '0.5.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/'
          ),
          packageDependencies: new Map([['minimist', '0.0.8'], ['mkdirp', '0.5.1']])
        }
      ]
    ])
  ],
  [
    'minimist',
    new Map([
      [
        '0.0.8',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/'
          ),
          packageDependencies: new Map([['minimist', '0.0.8']])
        }
      ],
      [
        '0.0.10',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-minimist-0.0.10-de3f98543dbf96082be48ad1a0c7cda836301dcf/node_modules/minimist/'
          ),
          packageDependencies: new Map([['minimist', '0.0.10']])
        }
      ],
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/'
          ),
          packageDependencies: new Map([['minimist', '1.2.0']])
        }
      ]
    ])
  ],
  [
    'path-parse',
    new Map([
      [
        '1.0.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/'
          ),
          packageDependencies: new Map([['path-parse', '1.0.6']])
        }
      ]
    ])
  ],
  [
    'istanbul-lib-source-maps',
    new Map([
      [
        '1.2.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-source-maps-1.2.6-37b9ff661580f8fca11232752ee42e08c6675d8f/node_modules/istanbul-lib-source-maps/'
          ),
          packageDependencies: new Map([
            ['debug', '3.2.6'],
            ['istanbul-lib-coverage', '1.2.1'],
            ['mkdirp', '0.5.1'],
            ['rimraf', '2.6.2'],
            ['source-map', '0.5.7'],
            ['istanbul-lib-source-maps', '1.2.6']
          ])
        }
      ]
    ])
  ],
  [
    'rimraf',
    new Map([
      [
        '2.6.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-rimraf-2.6.2-2ed8150d24a16ea8651e6d6ef0f47c4158ce7a36/node_modules/rimraf/'
          ),
          packageDependencies: new Map([['glob', '7.1.3'], ['rimraf', '2.6.2']])
        }
      ]
    ])
  ],
  [
    'istanbul-reports',
    new Map([
      [
        '1.5.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-istanbul-reports-1.5.1-97e4dbf3b515e8c484caea15d6524eebd3ff4e1a/node_modules/istanbul-reports/'
          ),
          packageDependencies: new Map([['handlebars', '4.0.12'], ['istanbul-reports', '1.5.1']])
        }
      ]
    ])
  ],
  [
    'handlebars',
    new Map([
      [
        '4.0.12',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-handlebars-4.0.12-2c15c8a96d46da5e266700518ba8cb8d919d5bc5/node_modules/handlebars/'
          ),
          packageDependencies: new Map([
            ['async', '2.6.1'],
            ['optimist', '0.6.1'],
            ['source-map', '0.6.1'],
            ['uglify-js', '3.4.9'],
            ['handlebars', '4.0.12']
          ])
        }
      ]
    ])
  ],
  [
    'optimist',
    new Map([
      [
        '0.6.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-optimist-0.6.1-da3ea74686fa21a19a111c326e90eb15a0196686/node_modules/optimist/'
          ),
          packageDependencies: new Map([['minimist', '0.0.10'], ['wordwrap', '0.0.3'], ['optimist', '0.6.1']])
        }
      ]
    ])
  ],
  [
    'wordwrap',
    new Map([
      [
        '0.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-wordwrap-0.0.3-a3d5da6cd5c0bc0008d37234bbaf1bed63059107/node_modules/wordwrap/'
          ),
          packageDependencies: new Map([['wordwrap', '0.0.3']])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-wordwrap-1.0.0-27584810891456a4171c8d0226441ade90cbcaeb/node_modules/wordwrap/'
          ),
          packageDependencies: new Map([['wordwrap', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'uglify-js',
    new Map([
      [
        '3.4.9',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-uglify-js-3.4.9-af02f180c1207d76432e473ed24a28f4a782bae3/node_modules/uglify-js/'
          ),
          packageDependencies: new Map([['commander', '2.17.1'], ['source-map', '0.6.1'], ['uglify-js', '3.4.9']])
        }
      ]
    ])
  ],
  [
    'commander',
    new Map([
      [
        '2.17.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-commander-2.17.1-bd77ab7de6de94205ceacc72f1716d29f20a77bf/node_modules/commander/'
          ),
          packageDependencies: new Map([['commander', '2.17.1']])
        }
      ]
    ])
  ],
  [
    'js-yaml',
    new Map([
      [
        '3.12.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-js-yaml-3.12.0-eaed656ec8344f10f527c6bfa1b6e2244de167d1/node_modules/js-yaml/'
          ),
          packageDependencies: new Map([['argparse', '1.0.10'], ['esprima', '4.0.1'], ['js-yaml', '3.12.0']])
        }
      ]
    ])
  ],
  [
    'argparse',
    new Map([
      [
        '1.0.10',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911/node_modules/argparse/'
          ),
          packageDependencies: new Map([['sprintf-js', '1.0.3'], ['argparse', '1.0.10']])
        }
      ]
    ])
  ],
  [
    'sprintf-js',
    new Map([
      [
        '1.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c/node_modules/sprintf-js/'
          ),
          packageDependencies: new Map([['sprintf-js', '1.0.3']])
        }
      ]
    ])
  ],
  [
    'esprima',
    new Map([
      [
        '4.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71/node_modules/esprima/'
          ),
          packageDependencies: new Map([['esprima', '4.0.1']])
        }
      ],
      [
        '3.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-esprima-3.1.3-fdca51cee6133895e3c88d535ce49dbff62a4633/node_modules/esprima/'
          ),
          packageDependencies: new Map([['esprima', '3.1.3']])
        }
      ]
    ])
  ],
  [
    'jest-changed-files',
    new Map([
      [
        '22.4.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-changed-files-22.4.3-8882181e022c38bd46a2e4d18d44d19d90a90fb2/node_modules/jest-changed-files/'
          ),
          packageDependencies: new Map([['throat', '4.1.0'], ['jest-changed-files', '22.4.3']])
        }
      ]
    ])
  ],
  [
    'throat',
    new Map([
      [
        '4.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-throat-4.1.0-89037cbc92c56ab18926e6ba4cbb200e15672a6a/node_modules/throat/'
          ),
          packageDependencies: new Map([['throat', '4.1.0']])
        }
      ]
    ])
  ],
  [
    'jest-config',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-config-23.6.0-f82546a90ade2d8c7026fbf6ac5207fc22f8eb1d/node_modules/jest-config/'
          ),
          packageDependencies: new Map([
            ['babel-core', '6.26.3'],
            ['babel-jest', 'pnp:c4ef49fe71ca03400d1cf69604c420f6d409b4d1'],
            ['chalk', '2.4.1'],
            ['glob', '7.1.3'],
            ['jest-environment-jsdom', '23.4.0'],
            ['jest-environment-node', '23.4.0'],
            ['jest-get-type', '22.4.3'],
            ['jest-jasmine2', '23.6.0'],
            ['jest-regex-util', '23.3.0'],
            ['jest-resolve', '23.6.0'],
            ['jest-util', '23.4.0'],
            ['jest-validate', '23.6.0'],
            ['micromatch', '2.3.11'],
            ['pretty-format', '23.6.0'],
            ['jest-config', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'babel-core',
    new Map([
      [
        '6.26.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-core-6.26.3-b2e2f09e342d0f0c88e2f02e067794125e75c207/node_modules/babel-core/'
          ),
          packageDependencies: new Map([
            ['babel-code-frame', '6.26.0'],
            ['babel-generator', '6.26.1'],
            ['babel-helpers', '6.24.1'],
            ['babel-messages', '6.23.0'],
            ['babel-register', '6.26.0'],
            ['babel-runtime', '6.26.0'],
            ['babel-template', '6.26.0'],
            ['babel-traverse', '6.26.0'],
            ['babel-types', '6.26.0'],
            ['babylon', '6.18.0'],
            ['convert-source-map', '1.6.0'],
            ['debug', '2.6.9'],
            ['json5', '0.5.1'],
            ['lodash', '4.17.11'],
            ['minimatch', '3.0.4'],
            ['path-is-absolute', '1.0.1'],
            ['private', '0.1.8'],
            ['slash', '1.0.0'],
            ['source-map', '0.5.7'],
            ['babel-core', '6.26.3']
          ])
        }
      ],
      [
        '7.0.0-bridge.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-core-7.0.0-bridge.0-95a492ddd90f9b4e9a4a1da14eb335b87b634ece/node_modules/babel-core/'
          ),
          packageDependencies: new Map([['@babel/core', '7.1.6'], ['babel-core', '7.0.0-bridge.0']])
        }
      ]
    ])
  ],
  [
    'babel-helpers',
    new Map([
      [
        '6.24.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-helpers-6.24.1-3471de9caec388e5c850e597e58a26ddf37602b2/node_modules/babel-helpers/'
          ),
          packageDependencies: new Map([
            ['babel-runtime', '6.26.0'],
            ['babel-template', '6.26.0'],
            ['babel-helpers', '6.24.1']
          ])
        }
      ]
    ])
  ],
  [
    'babel-register',
    new Map([
      [
        '6.26.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-babel-register-6.26.0-6ed021173e2fcb486d7acb45c6009a856f647071/node_modules/babel-register/'
          ),
          packageDependencies: new Map([
            ['babel-core', '6.26.3'],
            ['babel-runtime', '6.26.0'],
            ['core-js', '2.5.7'],
            ['home-or-tmp', '2.0.0'],
            ['lodash', '4.17.11'],
            ['mkdirp', '0.5.1'],
            ['source-map-support', '0.4.18'],
            ['babel-register', '6.26.0']
          ])
        }
      ]
    ])
  ],
  [
    'home-or-tmp',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-home-or-tmp-2.0.0-e36c3f2d2cae7d746a857e38d18d5f32a7882db8/node_modules/home-or-tmp/'
          ),
          packageDependencies: new Map([['os-homedir', '1.0.2'], ['os-tmpdir', '1.0.2'], ['home-or-tmp', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'os-homedir',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/'
          ),
          packageDependencies: new Map([['os-homedir', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'os-tmpdir',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/'
          ),
          packageDependencies: new Map([['os-tmpdir', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'source-map-support',
    new Map([
      [
        '0.4.18',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-source-map-support-0.4.18-0286a6de8be42641338594e97ccea75f0a2c585f/node_modules/source-map-support/'
          ),
          packageDependencies: new Map([['source-map', '0.5.7'], ['source-map-support', '0.4.18']])
        }
      ],
      [
        '0.5.9',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-source-map-support-0.5.9-41bc953b2534267ea2d605bccfa7bfa3111ced5f/node_modules/source-map-support/'
          ),
          packageDependencies: new Map([
            ['buffer-from', '1.1.1'],
            ['source-map', '0.6.1'],
            ['source-map-support', '0.5.9']
          ])
        }
      ]
    ])
  ],
  [
    'convert-source-map',
    new Map([
      [
        '1.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-convert-source-map-1.6.0-51b537a8c43e0f04dec1993bffcdd504e758ac20/node_modules/convert-source-map/'
          ),
          packageDependencies: new Map([['safe-buffer', '5.1.2'], ['convert-source-map', '1.6.0']])
        }
      ]
    ])
  ],
  [
    'safe-buffer',
    new Map([
      [
        '5.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/'
          ),
          packageDependencies: new Map([['safe-buffer', '5.1.2']])
        }
      ]
    ])
  ],
  [
    'json5',
    new Map([
      [
        '0.5.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-json5-0.5.1-1eade7acc012034ad84e2396767ead9fa5495821/node_modules/json5/'
          ),
          packageDependencies: new Map([['json5', '0.5.1']])
        }
      ],
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-json5-2.1.0-e7a0c62c48285c628d20a10b85c89bb807c32850/node_modules/json5/'
          ),
          packageDependencies: new Map([['minimist', '1.2.0'], ['json5', '2.1.0']])
        }
      ]
    ])
  ],
  [
    'private',
    new Map([
      [
        '0.1.8',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-private-0.1.8-2381edb3689f7a53d653190060fcf822d2f368ff/node_modules/private/'
          ),
          packageDependencies: new Map([['private', '0.1.8']])
        }
      ]
    ])
  ],
  [
    'slash',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-slash-1.0.0-c41f2f6c39fc16d1cd17ad4b5d896114ae470d55/node_modules/slash/'
          ),
          packageDependencies: new Map([['slash', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'jest-environment-jsdom',
    new Map([
      [
        '23.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-environment-jsdom-23.4.0-056a7952b3fea513ac62a140a2c368c79d9e6023/node_modules/jest-environment-jsdom/'
          ),
          packageDependencies: new Map([
            ['jest-mock', '23.2.0'],
            ['jest-util', '23.4.0'],
            ['jsdom', '11.12.0'],
            ['jest-environment-jsdom', '23.4.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-mock',
    new Map([
      [
        '23.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-mock-23.2.0-ad1c60f29e8719d47c26e1138098b6d18b261134/node_modules/jest-mock/'
          ),
          packageDependencies: new Map([['jest-mock', '23.2.0']])
        }
      ]
    ])
  ],
  [
    'jest-util',
    new Map([
      [
        '23.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-util-23.4.0-4d063cb927baf0a23831ff61bec2cbbf49793561/node_modules/jest-util/'
          ),
          packageDependencies: new Map([
            ['callsites', '2.0.0'],
            ['chalk', '2.4.1'],
            ['graceful-fs', '4.1.15'],
            ['is-ci', '1.2.1'],
            ['jest-message-util', '23.4.0'],
            ['mkdirp', '0.5.1'],
            ['slash', '1.0.0'],
            ['source-map', '0.6.1'],
            ['jest-util', '23.4.0']
          ])
        }
      ]
    ])
  ],
  [
    'callsites',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-callsites-2.0.0-06eb84f00eea413da86affefacbffb36093b3c50/node_modules/callsites/'
          ),
          packageDependencies: new Map([['callsites', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'jest-message-util',
    new Map([
      [
        '23.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-message-util-23.4.0-17610c50942349508d01a3d1e0bda2c079086a9f/node_modules/jest-message-util/'
          ),
          packageDependencies: new Map([
            ['@babel/code-frame', '7.0.0'],
            ['chalk', '2.4.1'],
            ['micromatch', '2.3.11'],
            ['slash', '1.0.0'],
            ['stack-utils', '1.0.2'],
            ['jest-message-util', '23.4.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/code-frame',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-code-frame-7.0.0-06e2ab19bdb535385559aabb5ba59729482800f8/node_modules/@babel/code-frame/'
          ),
          packageDependencies: new Map([['@babel/highlight', '7.0.0'], ['@babel/code-frame', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/highlight',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-highlight-7.0.0-f710c38c8d458e6dd9a201afb637fcb781ce99e4/node_modules/@babel/highlight/'
          ),
          packageDependencies: new Map([
            ['chalk', '2.4.1'],
            ['esutils', '2.0.2'],
            ['js-tokens', '4.0.0'],
            ['@babel/highlight', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'stack-utils',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-stack-utils-1.0.2-33eba3897788558bebfc2db059dc158ec36cebb8/node_modules/stack-utils/'
          ),
          packageDependencies: new Map([['stack-utils', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'jsdom',
    new Map([
      [
        '11.12.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jsdom-11.12.0-1a80d40ddd378a1de59656e9e6dc5a3ba8657bc8/node_modules/jsdom/'
          ),
          packageDependencies: new Map([
            ['abab', '2.0.0'],
            ['acorn', '5.7.3'],
            ['acorn-globals', '4.3.0'],
            ['array-equal', '1.0.0'],
            ['cssom', '0.3.4'],
            ['cssstyle', '1.1.1'],
            ['data-urls', '1.1.0'],
            ['domexception', '1.0.1'],
            ['escodegen', '1.11.0'],
            ['html-encoding-sniffer', '1.0.2'],
            ['left-pad', '1.3.0'],
            ['nwsapi', '2.0.9'],
            ['parse5', '4.0.0'],
            ['pn', '1.1.0'],
            ['request', '2.88.0'],
            ['request-promise-native', '1.0.5'],
            ['sax', '1.2.4'],
            ['symbol-tree', '3.2.2'],
            ['tough-cookie', '2.5.0'],
            ['w3c-hr-time', '1.0.1'],
            ['webidl-conversions', '4.0.2'],
            ['whatwg-encoding', '1.0.5'],
            ['whatwg-mimetype', '2.3.0'],
            ['whatwg-url', '6.5.0'],
            ['ws', '5.2.2'],
            ['xml-name-validator', '3.0.0'],
            ['jsdom', '11.12.0']
          ])
        }
      ]
    ])
  ],
  [
    'abab',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-abab-2.0.0-aba0ab4c5eee2d4c79d3487d85450fb2376ebb0f/node_modules/abab/'
          ),
          packageDependencies: new Map([['abab', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'acorn',
    new Map([
      [
        '5.7.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-acorn-5.7.3-67aa231bf8812974b85235a96771eb6bd07ea279/node_modules/acorn/'
          ),
          packageDependencies: new Map([['acorn', '5.7.3']])
        }
      ],
      [
        '6.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-acorn-6.0.4-77377e7353b72ec5104550aa2d2097a2fd40b754/node_modules/acorn/'
          ),
          packageDependencies: new Map([['acorn', '6.0.4']])
        }
      ]
    ])
  ],
  [
    'acorn-globals',
    new Map([
      [
        '4.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-acorn-globals-4.3.0-e3b6f8da3c1552a95ae627571f7dd6923bb54103/node_modules/acorn-globals/'
          ),
          packageDependencies: new Map([['acorn', '6.0.4'], ['acorn-walk', '6.1.1'], ['acorn-globals', '4.3.0']])
        }
      ]
    ])
  ],
  [
    'acorn-walk',
    new Map([
      [
        '6.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-acorn-walk-6.1.1-d363b66f5fac5f018ff9c3a1e7b6f8e310cc3913/node_modules/acorn-walk/'
          ),
          packageDependencies: new Map([['acorn-walk', '6.1.1']])
        }
      ]
    ])
  ],
  [
    'array-equal',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-array-equal-1.0.0-8c2a5ef2472fd9ea742b04c77a75093ba2757c93/node_modules/array-equal/'
          ),
          packageDependencies: new Map([['array-equal', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'cssom',
    new Map([
      [
        '0.3.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-cssom-0.3.4-8cd52e8a3acfd68d3aed38ee0a640177d2f9d797/node_modules/cssom/'
          ),
          packageDependencies: new Map([['cssom', '0.3.4']])
        }
      ]
    ])
  ],
  [
    'cssstyle',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-cssstyle-1.1.1-18b038a9c44d65f7a8e428a653b9f6fe42faf5fb/node_modules/cssstyle/'
          ),
          packageDependencies: new Map([['cssom', '0.3.4'], ['cssstyle', '1.1.1']])
        }
      ]
    ])
  ],
  [
    'data-urls',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-data-urls-1.1.0-15ee0582baa5e22bb59c77140da8f9c76963bbfe/node_modules/data-urls/'
          ),
          packageDependencies: new Map([
            ['abab', '2.0.0'],
            ['whatwg-mimetype', '2.3.0'],
            ['whatwg-url', '7.0.0'],
            ['data-urls', '1.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'whatwg-mimetype',
    new Map([
      [
        '2.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-whatwg-mimetype-2.3.0-3d4b1e0312d2079879f826aff18dbeeca5960fbf/node_modules/whatwg-mimetype/'
          ),
          packageDependencies: new Map([['whatwg-mimetype', '2.3.0']])
        }
      ]
    ])
  ],
  [
    'whatwg-url',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-whatwg-url-7.0.0-fde926fa54a599f3adf82dff25a9f7be02dc6edd/node_modules/whatwg-url/'
          ),
          packageDependencies: new Map([
            ['lodash.sortby', '4.7.0'],
            ['tr46', '1.0.1'],
            ['webidl-conversions', '4.0.2'],
            ['whatwg-url', '7.0.0']
          ])
        }
      ],
      [
        '6.5.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-whatwg-url-6.5.0-f2df02bff176fd65070df74ad5ccbb5a199965a8/node_modules/whatwg-url/'
          ),
          packageDependencies: new Map([
            ['lodash.sortby', '4.7.0'],
            ['tr46', '1.0.1'],
            ['webidl-conversions', '4.0.2'],
            ['whatwg-url', '6.5.0']
          ])
        }
      ]
    ])
  ],
  [
    'lodash.sortby',
    new Map([
      [
        '4.7.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-lodash-sortby-4.7.0-edd14c824e2cc9c1e0b0a1b42bb5210516a42438/node_modules/lodash.sortby/'
          ),
          packageDependencies: new Map([['lodash.sortby', '4.7.0']])
        }
      ]
    ])
  ],
  [
    'tr46',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-tr46-1.0.1-a8b13fd6bfd2489519674ccde55ba3693b706d09/node_modules/tr46/'
          ),
          packageDependencies: new Map([['punycode', '2.1.1'], ['tr46', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'punycode',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/'
          ),
          packageDependencies: new Map([['punycode', '2.1.1']])
        }
      ],
      [
        '1.4.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-punycode-1.4.1-c0d5a63b2718800ad8e1eb0fa5269c84dd41845e/node_modules/punycode/'
          ),
          packageDependencies: new Map([['punycode', '1.4.1']])
        }
      ]
    ])
  ],
  [
    'webidl-conversions',
    new Map([
      [
        '4.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-webidl-conversions-4.0.2-a855980b1f0b6b359ba1d5d9fb39ae941faa63ad/node_modules/webidl-conversions/'
          ),
          packageDependencies: new Map([['webidl-conversions', '4.0.2']])
        }
      ]
    ])
  ],
  [
    'domexception',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-domexception-1.0.1-937442644ca6a31261ef36e3ec677fe805582c90/node_modules/domexception/'
          ),
          packageDependencies: new Map([['webidl-conversions', '4.0.2'], ['domexception', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'escodegen',
    new Map([
      [
        '1.11.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-escodegen-1.11.0-b27a9389481d5bfd5bec76f7bb1eb3f8f4556589/node_modules/escodegen/'
          ),
          packageDependencies: new Map([
            ['esprima', '3.1.3'],
            ['estraverse', '4.2.0'],
            ['esutils', '2.0.2'],
            ['optionator', '0.8.2'],
            ['source-map', '0.6.1'],
            ['escodegen', '1.11.0']
          ])
        }
      ]
    ])
  ],
  [
    'estraverse',
    new Map([
      [
        '4.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-estraverse-4.2.0-0dee3fed31fcd469618ce7342099fc1afa0bdb13/node_modules/estraverse/'
          ),
          packageDependencies: new Map([['estraverse', '4.2.0']])
        }
      ]
    ])
  ],
  [
    'optionator',
    new Map([
      [
        '0.8.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-optionator-0.8.2-364c5e409d3f4d6301d6c0b4c05bba50180aeb64/node_modules/optionator/'
          ),
          packageDependencies: new Map([
            ['deep-is', '0.1.3'],
            ['fast-levenshtein', '2.0.6'],
            ['levn', '0.3.0'],
            ['prelude-ls', '1.1.2'],
            ['type-check', '0.3.2'],
            ['wordwrap', '1.0.0'],
            ['optionator', '0.8.2']
          ])
        }
      ]
    ])
  ],
  [
    'deep-is',
    new Map([
      [
        '0.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/'
          ),
          packageDependencies: new Map([['deep-is', '0.1.3']])
        }
      ]
    ])
  ],
  [
    'fast-levenshtein',
    new Map([
      [
        '2.0.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917/node_modules/fast-levenshtein/'
          ),
          packageDependencies: new Map([['fast-levenshtein', '2.0.6']])
        }
      ]
    ])
  ],
  [
    'levn',
    new Map([
      [
        '0.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee/node_modules/levn/'
          ),
          packageDependencies: new Map([['prelude-ls', '1.1.2'], ['type-check', '0.3.2'], ['levn', '0.3.0']])
        }
      ]
    ])
  ],
  [
    'prelude-ls',
    new Map([
      [
        '1.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54/node_modules/prelude-ls/'
          ),
          packageDependencies: new Map([['prelude-ls', '1.1.2']])
        }
      ]
    ])
  ],
  [
    'type-check',
    new Map([
      [
        '0.3.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72/node_modules/type-check/'
          ),
          packageDependencies: new Map([['prelude-ls', '1.1.2'], ['type-check', '0.3.2']])
        }
      ]
    ])
  ],
  [
    'html-encoding-sniffer',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-html-encoding-sniffer-1.0.2-e70d84b94da53aa375e11fe3a351be6642ca46f8/node_modules/html-encoding-sniffer/'
          ),
          packageDependencies: new Map([['whatwg-encoding', '1.0.5'], ['html-encoding-sniffer', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'whatwg-encoding',
    new Map([
      [
        '1.0.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-whatwg-encoding-1.0.5-5abacf777c32166a51d085d6b4f3e7d27113ddb0/node_modules/whatwg-encoding/'
          ),
          packageDependencies: new Map([['iconv-lite', '0.4.24'], ['whatwg-encoding', '1.0.5']])
        }
      ]
    ])
  ],
  [
    'iconv-lite',
    new Map([
      [
        '0.4.24',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/'
          ),
          packageDependencies: new Map([['safer-buffer', '2.1.2'], ['iconv-lite', '0.4.24']])
        }
      ]
    ])
  ],
  [
    'safer-buffer',
    new Map([
      [
        '2.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/'
          ),
          packageDependencies: new Map([['safer-buffer', '2.1.2']])
        }
      ]
    ])
  ],
  [
    'left-pad',
    new Map([
      [
        '1.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-left-pad-1.3.0-5b8a3a7765dfe001261dde915589e782f8c94d1e/node_modules/left-pad/'
          ),
          packageDependencies: new Map([['left-pad', '1.3.0']])
        }
      ]
    ])
  ],
  [
    'nwsapi',
    new Map([
      [
        '2.0.9',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-nwsapi-2.0.9-77ac0cdfdcad52b6a1151a84e73254edc33ed016/node_modules/nwsapi/'
          ),
          packageDependencies: new Map([['nwsapi', '2.0.9']])
        }
      ]
    ])
  ],
  [
    'parse5',
    new Map([
      [
        '4.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-parse5-4.0.0-6d78656e3da8d78b4ec0b906f7c08ef1dfe3f608/node_modules/parse5/'
          ),
          packageDependencies: new Map([['parse5', '4.0.0']])
        }
      ]
    ])
  ],
  [
    'pn',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pn-1.1.0-e2f4cef0e219f463c179ab37463e4e1ecdccbafb/node_modules/pn/'
          ),
          packageDependencies: new Map([['pn', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'request',
    new Map([
      [
        '2.88.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-request-2.88.0-9c2fca4f7d35b592efe57c7f0a55e81052124fef/node_modules/request/'
          ),
          packageDependencies: new Map([
            ['aws-sign2', '0.7.0'],
            ['aws4', '1.8.0'],
            ['caseless', '0.12.0'],
            ['combined-stream', '1.0.7'],
            ['extend', '3.0.2'],
            ['forever-agent', '0.6.1'],
            ['form-data', '2.3.3'],
            ['har-validator', '5.1.3'],
            ['http-signature', '1.2.0'],
            ['is-typedarray', '1.0.0'],
            ['isstream', '0.1.2'],
            ['json-stringify-safe', '5.0.1'],
            ['mime-types', '2.1.21'],
            ['oauth-sign', '0.9.0'],
            ['performance-now', '2.1.0'],
            ['qs', '6.5.2'],
            ['safe-buffer', '5.1.2'],
            ['tough-cookie', '2.4.3'],
            ['tunnel-agent', '0.6.0'],
            ['uuid', '3.3.2'],
            ['request', '2.88.0']
          ])
        }
      ]
    ])
  ],
  [
    'aws-sign2',
    new Map([
      [
        '0.7.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-aws-sign2-0.7.0-b46e890934a9591f2d2f6f86d7e6a9f1b3fe76a8/node_modules/aws-sign2/'
          ),
          packageDependencies: new Map([['aws-sign2', '0.7.0']])
        }
      ]
    ])
  ],
  [
    'aws4',
    new Map([
      [
        '1.8.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-aws4-1.8.0-f0e003d9ca9e7f59c7a508945d7b2ef9a04a542f/node_modules/aws4/'
          ),
          packageDependencies: new Map([['aws4', '1.8.0']])
        }
      ]
    ])
  ],
  [
    'caseless',
    new Map([
      [
        '0.12.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-caseless-0.12.0-1b681c21ff84033c826543090689420d187151dc/node_modules/caseless/'
          ),
          packageDependencies: new Map([['caseless', '0.12.0']])
        }
      ]
    ])
  ],
  [
    'combined-stream',
    new Map([
      [
        '1.0.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-combined-stream-1.0.7-2d1d24317afb8abe95d6d2c0b07b57813539d828/node_modules/combined-stream/'
          ),
          packageDependencies: new Map([['delayed-stream', '1.0.0'], ['combined-stream', '1.0.7']])
        }
      ]
    ])
  ],
  [
    'delayed-stream',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-delayed-stream-1.0.0-df3ae199acadfb7d440aaae0b29e2272b24ec619/node_modules/delayed-stream/'
          ),
          packageDependencies: new Map([['delayed-stream', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'extend',
    new Map([
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extend-3.0.2-f8b1136b4071fbd8eb140aff858b1019ec2915fa/node_modules/extend/'
          ),
          packageDependencies: new Map([['extend', '3.0.2']])
        }
      ]
    ])
  ],
  [
    'forever-agent',
    new Map([
      [
        '0.6.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-forever-agent-0.6.1-fbc71f0c41adeb37f96c577ad1ed42d8fdacca91/node_modules/forever-agent/'
          ),
          packageDependencies: new Map([['forever-agent', '0.6.1']])
        }
      ]
    ])
  ],
  [
    'form-data',
    new Map([
      [
        '2.3.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-form-data-2.3.3-dcce52c05f644f298c6a7ab936bd724ceffbf3a6/node_modules/form-data/'
          ),
          packageDependencies: new Map([
            ['asynckit', '0.4.0'],
            ['combined-stream', '1.0.7'],
            ['mime-types', '2.1.21'],
            ['form-data', '2.3.3']
          ])
        }
      ]
    ])
  ],
  [
    'asynckit',
    new Map([
      [
        '0.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-asynckit-0.4.0-c79ed97f7f34cb8f2ba1bc9790bcc366474b4b79/node_modules/asynckit/'
          ),
          packageDependencies: new Map([['asynckit', '0.4.0']])
        }
      ]
    ])
  ],
  [
    'mime-types',
    new Map([
      [
        '2.1.21',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-mime-types-2.1.21-28995aa1ecb770742fe6ae7e58f9181c744b3f96/node_modules/mime-types/'
          ),
          packageDependencies: new Map([['mime-db', '1.37.0'], ['mime-types', '2.1.21']])
        }
      ]
    ])
  ],
  [
    'mime-db',
    new Map([
      [
        '1.37.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-mime-db-1.37.0-0b6a0ce6fdbe9576e25f1f2d2fde8830dc0ad0d8/node_modules/mime-db/'
          ),
          packageDependencies: new Map([['mime-db', '1.37.0']])
        }
      ]
    ])
  ],
  [
    'har-validator',
    new Map([
      [
        '5.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-har-validator-5.1.3-1ef89ebd3e4996557675eed9893110dc350fa080/node_modules/har-validator/'
          ),
          packageDependencies: new Map([['ajv', '6.6.1'], ['har-schema', '2.0.0'], ['har-validator', '5.1.3']])
        }
      ]
    ])
  ],
  [
    'ajv',
    new Map([
      [
        '6.6.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ajv-6.6.1-6360f5ed0d80f232cc2b294c362d5dc2e538dd61/node_modules/ajv/'
          ),
          packageDependencies: new Map([
            ['fast-deep-equal', '2.0.1'],
            ['fast-json-stable-stringify', '2.0.0'],
            ['json-schema-traverse', '0.4.1'],
            ['uri-js', '4.2.2'],
            ['ajv', '6.6.1']
          ])
        }
      ]
    ])
  ],
  [
    'fast-deep-equal',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/'
          ),
          packageDependencies: new Map([['fast-deep-equal', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'fast-json-stable-stringify',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/'
          ),
          packageDependencies: new Map([['fast-json-stable-stringify', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'json-schema-traverse',
    new Map([
      [
        '0.4.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/'
          ),
          packageDependencies: new Map([['json-schema-traverse', '0.4.1']])
        }
      ]
    ])
  ],
  [
    'uri-js',
    new Map([
      [
        '4.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/'
          ),
          packageDependencies: new Map([['punycode', '2.1.1'], ['uri-js', '4.2.2']])
        }
      ]
    ])
  ],
  [
    'har-schema',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-har-schema-2.0.0-a94c2224ebcac04782a0d9035521f24735b7ec92/node_modules/har-schema/'
          ),
          packageDependencies: new Map([['har-schema', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'http-signature',
    new Map([
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-http-signature-1.2.0-9aecd925114772f3d95b65a60abb8f7c18fbace1/node_modules/http-signature/'
          ),
          packageDependencies: new Map([
            ['assert-plus', '1.0.0'],
            ['jsprim', '1.4.1'],
            ['sshpk', '1.15.2'],
            ['http-signature', '1.2.0']
          ])
        }
      ]
    ])
  ],
  [
    'assert-plus',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-assert-plus-1.0.0-f12e0f3c5d77b0b1cdd9146942e4e96c1e4dd525/node_modules/assert-plus/'
          ),
          packageDependencies: new Map([['assert-plus', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'jsprim',
    new Map([
      [
        '1.4.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jsprim-1.4.1-313e66bc1e5cc06e438bc1b7499c2e5c56acb6a2/node_modules/jsprim/'
          ),
          packageDependencies: new Map([
            ['assert-plus', '1.0.0'],
            ['extsprintf', '1.3.0'],
            ['json-schema', '0.2.3'],
            ['verror', '1.10.0'],
            ['jsprim', '1.4.1']
          ])
        }
      ]
    ])
  ],
  [
    'extsprintf',
    new Map([
      [
        '1.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extsprintf-1.3.0-96918440e3041a7a414f8c52e3c574eb3c3e1e05/node_modules/extsprintf/'
          ),
          packageDependencies: new Map([['extsprintf', '1.3.0']])
        }
      ],
      [
        '1.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extsprintf-1.4.0-e2689f8f356fad62cca65a3a91c5df5f9551692f/node_modules/extsprintf/'
          ),
          packageDependencies: new Map([['extsprintf', '1.4.0']])
        }
      ]
    ])
  ],
  [
    'json-schema',
    new Map([
      [
        '0.2.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-json-schema-0.2.3-b480c892e59a2f05954ce727bd3f2a4e882f9e13/node_modules/json-schema/'
          ),
          packageDependencies: new Map([['json-schema', '0.2.3']])
        }
      ]
    ])
  ],
  [
    'verror',
    new Map([
      [
        '1.10.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-verror-1.10.0-3a105ca17053af55d6e270c1f8288682e18da400/node_modules/verror/'
          ),
          packageDependencies: new Map([
            ['assert-plus', '1.0.0'],
            ['core-util-is', '1.0.2'],
            ['extsprintf', '1.4.0'],
            ['verror', '1.10.0']
          ])
        }
      ]
    ])
  ],
  [
    'core-util-is',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/'
          ),
          packageDependencies: new Map([['core-util-is', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'sshpk',
    new Map([
      [
        '1.15.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-sshpk-1.15.2-c946d6bd9b1a39d0e8635763f5242d6ed6dcb629/node_modules/sshpk/'
          ),
          packageDependencies: new Map([
            ['asn1', '0.2.4'],
            ['assert-plus', '1.0.0'],
            ['bcrypt-pbkdf', '1.0.2'],
            ['dashdash', '1.14.1'],
            ['ecc-jsbn', '0.1.2'],
            ['getpass', '0.1.7'],
            ['jsbn', '0.1.1'],
            ['safer-buffer', '2.1.2'],
            ['tweetnacl', '0.14.5'],
            ['sshpk', '1.15.2']
          ])
        }
      ]
    ])
  ],
  [
    'asn1',
    new Map([
      [
        '0.2.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-asn1-0.2.4-8d2475dfab553bb33e77b54e59e880bb8ce23136/node_modules/asn1/'
          ),
          packageDependencies: new Map([['safer-buffer', '2.1.2'], ['asn1', '0.2.4']])
        }
      ]
    ])
  ],
  [
    'bcrypt-pbkdf',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-bcrypt-pbkdf-1.0.2-a4301d389b6a43f9b67ff3ca11a3f6637e360e9e/node_modules/bcrypt-pbkdf/'
          ),
          packageDependencies: new Map([['tweetnacl', '0.14.5'], ['bcrypt-pbkdf', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'tweetnacl',
    new Map([
      [
        '0.14.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-tweetnacl-0.14.5-5ae68177f192d4456269d108afa93ff8743f4f64/node_modules/tweetnacl/'
          ),
          packageDependencies: new Map([['tweetnacl', '0.14.5']])
        }
      ]
    ])
  ],
  [
    'dashdash',
    new Map([
      [
        '1.14.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-dashdash-1.14.1-853cfa0f7cbe2fed5de20326b8dd581035f6e2f0/node_modules/dashdash/'
          ),
          packageDependencies: new Map([['assert-plus', '1.0.0'], ['dashdash', '1.14.1']])
        }
      ]
    ])
  ],
  [
    'ecc-jsbn',
    new Map([
      [
        '0.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ecc-jsbn-0.1.2-3a83a904e54353287874c564b7549386849a98c9/node_modules/ecc-jsbn/'
          ),
          packageDependencies: new Map([['jsbn', '0.1.1'], ['safer-buffer', '2.1.2'], ['ecc-jsbn', '0.1.2']])
        }
      ]
    ])
  ],
  [
    'jsbn',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jsbn-0.1.1-a5e654c2e5a2deb5f201d96cefbca80c0ef2f513/node_modules/jsbn/'
          ),
          packageDependencies: new Map([['jsbn', '0.1.1']])
        }
      ]
    ])
  ],
  [
    'getpass',
    new Map([
      [
        '0.1.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-getpass-0.1.7-5eff8e3e684d569ae4cb2b1282604e8ba62149fa/node_modules/getpass/'
          ),
          packageDependencies: new Map([['assert-plus', '1.0.0'], ['getpass', '0.1.7']])
        }
      ]
    ])
  ],
  [
    'is-typedarray',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-typedarray-1.0.0-e479c80858df0c1b11ddda6940f96011fcda4a9a/node_modules/is-typedarray/'
          ),
          packageDependencies: new Map([['is-typedarray', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'isstream',
    new Map([
      [
        '0.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-isstream-0.1.2-47e63f7af55afa6f92e1500e690eb8b8529c099a/node_modules/isstream/'
          ),
          packageDependencies: new Map([['isstream', '0.1.2']])
        }
      ]
    ])
  ],
  [
    'json-stringify-safe',
    new Map([
      [
        '5.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-json-stringify-safe-5.0.1-1296a2d58fd45f19a0f6ce01d65701e2c735b6eb/node_modules/json-stringify-safe/'
          ),
          packageDependencies: new Map([['json-stringify-safe', '5.0.1']])
        }
      ]
    ])
  ],
  [
    'oauth-sign',
    new Map([
      [
        '0.9.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-oauth-sign-0.9.0-47a7b016baa68b5fa0ecf3dee08a85c679ac6455/node_modules/oauth-sign/'
          ),
          packageDependencies: new Map([['oauth-sign', '0.9.0']])
        }
      ]
    ])
  ],
  [
    'performance-now',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-performance-now-2.1.0-6309f4e0e5fa913ec1c69307ae364b4b377c9e7b/node_modules/performance-now/'
          ),
          packageDependencies: new Map([['performance-now', '2.1.0']])
        }
      ]
    ])
  ],
  [
    'qs',
    new Map([
      [
        '6.5.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-qs-6.5.2-cb3ae806e8740444584ef154ce8ee98d403f3e36/node_modules/qs/'
          ),
          packageDependencies: new Map([['qs', '6.5.2']])
        }
      ]
    ])
  ],
  [
    'tough-cookie',
    new Map([
      [
        '2.4.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-tough-cookie-2.4.3-53f36da3f47783b0925afa06ff9f3b165280f781/node_modules/tough-cookie/'
          ),
          packageDependencies: new Map([['psl', '1.1.29'], ['punycode', '1.4.1'], ['tough-cookie', '2.4.3']])
        }
      ],
      [
        '2.5.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-tough-cookie-2.5.0-cd9fb2a0aa1d5a12b473bd9fb96fa3dcff65ade2/node_modules/tough-cookie/'
          ),
          packageDependencies: new Map([['psl', '1.1.29'], ['punycode', '2.1.1'], ['tough-cookie', '2.5.0']])
        }
      ]
    ])
  ],
  [
    'psl',
    new Map([
      [
        '1.1.29',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-psl-1.1.29-60f580d360170bb722a797cc704411e6da850c67/node_modules/psl/'
          ),
          packageDependencies: new Map([['psl', '1.1.29']])
        }
      ]
    ])
  ],
  [
    'tunnel-agent',
    new Map([
      [
        '0.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-tunnel-agent-0.6.0-27a5dea06b36b04a0a9966774b290868f0fc40fd/node_modules/tunnel-agent/'
          ),
          packageDependencies: new Map([['safe-buffer', '5.1.2'], ['tunnel-agent', '0.6.0']])
        }
      ]
    ])
  ],
  [
    'uuid',
    new Map([
      [
        '3.3.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-uuid-3.3.2-1b4af4955eb3077c501c23872fc6513811587131/node_modules/uuid/'
          ),
          packageDependencies: new Map([['uuid', '3.3.2']])
        }
      ]
    ])
  ],
  [
    'request-promise-native',
    new Map([
      [
        '1.0.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-request-promise-native-1.0.5-5281770f68e0c9719e5163fd3fab482215f4fda5/node_modules/request-promise-native/'
          ),
          packageDependencies: new Map([
            ['request', '2.88.0'],
            ['request-promise-core', '1.1.1'],
            ['stealthy-require', '1.1.1'],
            ['tough-cookie', '2.5.0'],
            ['request-promise-native', '1.0.5']
          ])
        }
      ]
    ])
  ],
  [
    'request-promise-core',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-request-promise-core-1.1.1-3eee00b2c5aa83239cfb04c5700da36f81cd08b6/node_modules/request-promise-core/'
          ),
          packageDependencies: new Map([
            ['request', '2.88.0'],
            ['lodash', '4.17.11'],
            ['request-promise-core', '1.1.1']
          ])
        }
      ]
    ])
  ],
  [
    'stealthy-require',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-stealthy-require-1.1.1-35b09875b4ff49f26a777e509b3090a3226bf24b/node_modules/stealthy-require/'
          ),
          packageDependencies: new Map([['stealthy-require', '1.1.1']])
        }
      ]
    ])
  ],
  [
    'sax',
    new Map([
      [
        '1.2.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/'
          ),
          packageDependencies: new Map([['sax', '1.2.4']])
        }
      ]
    ])
  ],
  [
    'symbol-tree',
    new Map([
      [
        '3.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-symbol-tree-3.2.2-ae27db38f660a7ae2e1c3b7d1bc290819b8519e6/node_modules/symbol-tree/'
          ),
          packageDependencies: new Map([['symbol-tree', '3.2.2']])
        }
      ]
    ])
  ],
  [
    'w3c-hr-time',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-w3c-hr-time-1.0.1-82ac2bff63d950ea9e3189a58a65625fedf19045/node_modules/w3c-hr-time/'
          ),
          packageDependencies: new Map([['browser-process-hrtime', '0.1.3'], ['w3c-hr-time', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'browser-process-hrtime',
    new Map([
      [
        '0.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-browser-process-hrtime-0.1.3-616f00faef1df7ec1b5bf9cfe2bdc3170f26c7b4/node_modules/browser-process-hrtime/'
          ),
          packageDependencies: new Map([['browser-process-hrtime', '0.1.3']])
        }
      ]
    ])
  ],
  [
    'ws',
    new Map([
      [
        '5.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ws-5.2.2-dffef14866b8e8dc9133582514d1befaf96e980f/node_modules/ws/'
          ),
          packageDependencies: new Map([['async-limiter', '1.0.0'], ['ws', '5.2.2']])
        }
      ]
    ])
  ],
  [
    'async-limiter',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-async-limiter-1.0.0-78faed8c3d074ab81f22b4e985d79e8738f720f8/node_modules/async-limiter/'
          ),
          packageDependencies: new Map([['async-limiter', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'xml-name-validator',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-xml-name-validator-3.0.0-6ae73e06de4d8c6e47f9fb181f78d648ad457c6a/node_modules/xml-name-validator/'
          ),
          packageDependencies: new Map([['xml-name-validator', '3.0.0']])
        }
      ]
    ])
  ],
  [
    'jest-environment-node',
    new Map([
      [
        '23.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-environment-node-23.4.0-57e80ed0841dea303167cce8cd79521debafde10/node_modules/jest-environment-node/'
          ),
          packageDependencies: new Map([
            ['jest-mock', '23.2.0'],
            ['jest-util', '23.4.0'],
            ['jest-environment-node', '23.4.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-get-type',
    new Map([
      [
        '22.4.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-get-type-22.4.3-e3a8504d8479342dd4420236b322869f18900ce4/node_modules/jest-get-type/'
          ),
          packageDependencies: new Map([['jest-get-type', '22.4.3']])
        }
      ]
    ])
  ],
  [
    'jest-jasmine2',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-jasmine2-23.6.0-840e937f848a6c8638df24360ab869cc718592e0/node_modules/jest-jasmine2/'
          ),
          packageDependencies: new Map([
            ['babel-traverse', '6.26.0'],
            ['chalk', '2.4.1'],
            ['co', '4.6.0'],
            ['expect', '23.6.0'],
            ['is-generator-fn', '1.0.0'],
            ['jest-diff', '23.6.0'],
            ['jest-each', '23.6.0'],
            ['jest-matcher-utils', '23.6.0'],
            ['jest-message-util', '23.4.0'],
            ['jest-snapshot', '23.6.0'],
            ['jest-util', '23.4.0'],
            ['pretty-format', '23.6.0'],
            ['jest-jasmine2', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'co',
    new Map([
      [
        '4.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-co-4.6.0-6ea6bdf3d853ae54ccb8e47bfa0bf3f9031fb184/node_modules/co/'
          ),
          packageDependencies: new Map([['co', '4.6.0']])
        }
      ]
    ])
  ],
  [
    'expect',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-expect-23.6.0-1e0c8d3ba9a581c87bd71fb9bc8862d443425f98/node_modules/expect/'
          ),
          packageDependencies: new Map([
            ['ansi-styles', '3.2.1'],
            ['jest-diff', '23.6.0'],
            ['jest-get-type', '22.4.3'],
            ['jest-matcher-utils', '23.6.0'],
            ['jest-message-util', '23.4.0'],
            ['jest-regex-util', '23.3.0'],
            ['expect', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-diff',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-diff-23.6.0-1500f3f16e850bb3d71233408089be099f610c7d/node_modules/jest-diff/'
          ),
          packageDependencies: new Map([
            ['chalk', '2.4.1'],
            ['diff', '3.5.0'],
            ['jest-get-type', '22.4.3'],
            ['pretty-format', '23.6.0'],
            ['jest-diff', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'diff',
    new Map([
      [
        '3.5.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-diff-3.5.0-800c0dd1e0a8bfbc95835c202ad220fe317e5a12/node_modules/diff/'
          ),
          packageDependencies: new Map([['diff', '3.5.0']])
        }
      ]
    ])
  ],
  [
    'pretty-format',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pretty-format-23.6.0-5eaac8eeb6b33b987b7fe6097ea6a8a146ab5760/node_modules/pretty-format/'
          ),
          packageDependencies: new Map([['ansi-regex', '3.0.0'], ['ansi-styles', '3.2.1'], ['pretty-format', '23.6.0']])
        }
      ]
    ])
  ],
  [
    'jest-matcher-utils',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-matcher-utils-23.6.0-726bcea0c5294261a7417afb6da3186b4b8cac80/node_modules/jest-matcher-utils/'
          ),
          packageDependencies: new Map([
            ['chalk', '2.4.1'],
            ['jest-get-type', '22.4.3'],
            ['pretty-format', '23.6.0'],
            ['jest-matcher-utils', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-regex-util',
    new Map([
      [
        '23.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-regex-util-23.3.0-5f86729547c2785c4002ceaa8f849fe8ca471bc5/node_modules/jest-regex-util/'
          ),
          packageDependencies: new Map([['jest-regex-util', '23.3.0']])
        }
      ]
    ])
  ],
  [
    'is-generator-fn',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-generator-fn-1.0.0-969d49e1bb3329f6bb7f09089be26578b2ddd46a/node_modules/is-generator-fn/'
          ),
          packageDependencies: new Map([['is-generator-fn', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'jest-each',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-each-23.6.0-ba0c3a82a8054387016139c733a05242d3d71575/node_modules/jest-each/'
          ),
          packageDependencies: new Map([['chalk', '2.4.1'], ['pretty-format', '23.6.0'], ['jest-each', '23.6.0']])
        }
      ]
    ])
  ],
  [
    'jest-snapshot',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-snapshot-23.6.0-f9c2625d1b18acda01ec2d2b826c0ce58a5aa17a/node_modules/jest-snapshot/'
          ),
          packageDependencies: new Map([
            ['babel-types', '6.26.0'],
            ['chalk', '2.4.1'],
            ['jest-diff', '23.6.0'],
            ['jest-matcher-utils', '23.6.0'],
            ['jest-message-util', '23.4.0'],
            ['jest-resolve', '23.6.0'],
            ['mkdirp', '0.5.1'],
            ['natural-compare', '1.4.0'],
            ['pretty-format', '23.6.0'],
            ['semver', '5.6.0'],
            ['jest-snapshot', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-resolve',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-resolve-23.6.0-cf1d1a24ce7ee7b23d661c33ba2150f3aebfa0ae/node_modules/jest-resolve/'
          ),
          packageDependencies: new Map([
            ['browser-resolve', '1.11.3'],
            ['chalk', '2.4.1'],
            ['realpath-native', '1.0.2'],
            ['jest-resolve', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'browser-resolve',
    new Map([
      [
        '1.11.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-browser-resolve-1.11.3-9b7cbb3d0f510e4cb86bdbd796124d28b5890af6/node_modules/browser-resolve/'
          ),
          packageDependencies: new Map([['resolve', '1.1.7'], ['browser-resolve', '1.11.3']])
        }
      ]
    ])
  ],
  [
    'resolve',
    new Map([
      [
        '1.1.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-resolve-1.1.7-203114d82ad2c5ed9e8e0411b3932875e889e97b/node_modules/resolve/'
          ),
          packageDependencies: new Map([['resolve', '1.1.7']])
        }
      ],
      [
        '1.8.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-resolve-1.8.1-82f1ec19a423ac1fbd080b0bab06ba36e84a7a26/node_modules/resolve/'
          ),
          packageDependencies: new Map([['path-parse', '1.0.6'], ['resolve', '1.8.1']])
        }
      ]
    ])
  ],
  [
    'realpath-native',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-realpath-native-1.0.2-cd51ce089b513b45cf9b1516c82989b51ccc6560/node_modules/realpath-native/'
          ),
          packageDependencies: new Map([['util.promisify', '1.0.0'], ['realpath-native', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'util.promisify',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-util-promisify-1.0.0-440f7165a459c9a16dc145eb8e72f35687097030/node_modules/util.promisify/'
          ),
          packageDependencies: new Map([
            ['define-properties', '1.1.3'],
            ['object.getownpropertydescriptors', '2.0.3'],
            ['util.promisify', '1.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'define-properties',
    new Map([
      [
        '1.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/'
          ),
          packageDependencies: new Map([['object-keys', '1.0.12'], ['define-properties', '1.1.3']])
        }
      ]
    ])
  ],
  [
    'object-keys',
    new Map([
      [
        '1.0.12',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-keys-1.0.12-09c53855377575310cca62f55bb334abff7b3ed2/node_modules/object-keys/'
          ),
          packageDependencies: new Map([['object-keys', '1.0.12']])
        }
      ]
    ])
  ],
  [
    'object.getownpropertydescriptors',
    new Map([
      [
        '2.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-getownpropertydescriptors-2.0.3-8758c846f5b407adab0f236e0986f14b051caa16/node_modules/object.getownpropertydescriptors/'
          ),
          packageDependencies: new Map([
            ['define-properties', '1.1.3'],
            ['es-abstract', '1.12.0'],
            ['object.getownpropertydescriptors', '2.0.3']
          ])
        }
      ]
    ])
  ],
  [
    'es-abstract',
    new Map([
      [
        '1.12.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-es-abstract-1.12.0-9dbbdd27c6856f0001421ca18782d786bf8a6165/node_modules/es-abstract/'
          ),
          packageDependencies: new Map([
            ['es-to-primitive', '1.2.0'],
            ['function-bind', '1.1.1'],
            ['has', '1.0.3'],
            ['is-callable', '1.1.4'],
            ['is-regex', '1.0.4'],
            ['es-abstract', '1.12.0']
          ])
        }
      ]
    ])
  ],
  [
    'es-to-primitive',
    new Map([
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-es-to-primitive-1.2.0-edf72478033456e8dda8ef09e00ad9650707f377/node_modules/es-to-primitive/'
          ),
          packageDependencies: new Map([
            ['is-callable', '1.1.4'],
            ['is-date-object', '1.0.1'],
            ['is-symbol', '1.0.2'],
            ['es-to-primitive', '1.2.0']
          ])
        }
      ]
    ])
  ],
  [
    'is-callable',
    new Map([
      [
        '1.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/'
          ),
          packageDependencies: new Map([['is-callable', '1.1.4']])
        }
      ]
    ])
  ],
  [
    'is-date-object',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/'
          ),
          packageDependencies: new Map([['is-date-object', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'is-symbol',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-symbol-1.0.2-a055f6ae57192caee329e7a860118b497a950f38/node_modules/is-symbol/'
          ),
          packageDependencies: new Map([['has-symbols', '1.0.0'], ['is-symbol', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'has-symbols',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-symbols-1.0.0-ba1a8f1af2a0fc39650f5c850367704122063b44/node_modules/has-symbols/'
          ),
          packageDependencies: new Map([['has-symbols', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'function-bind',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/'
          ),
          packageDependencies: new Map([['function-bind', '1.1.1']])
        }
      ]
    ])
  ],
  [
    'has',
    new Map([
      [
        '1.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/'
          ),
          packageDependencies: new Map([['function-bind', '1.1.1'], ['has', '1.0.3']])
        }
      ]
    ])
  ],
  [
    'is-regex',
    new Map([
      [
        '1.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/'
          ),
          packageDependencies: new Map([['has', '1.0.3'], ['is-regex', '1.0.4']])
        }
      ]
    ])
  ],
  [
    'natural-compare',
    new Map([
      [
        '1.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7/node_modules/natural-compare/'
          ),
          packageDependencies: new Map([['natural-compare', '1.4.0']])
        }
      ]
    ])
  ],
  [
    'jest-validate',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-validate-23.6.0-36761f99d1ed33fcd425b4e4c5595d62b6597474/node_modules/jest-validate/'
          ),
          packageDependencies: new Map([
            ['chalk', '2.4.1'],
            ['jest-get-type', '22.4.3'],
            ['leven', '2.1.0'],
            ['pretty-format', '23.6.0'],
            ['jest-validate', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'leven',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-leven-2.1.0-c2e7a9f772094dee9d34202ae8acce4687875580/node_modules/leven/'
          ),
          packageDependencies: new Map([['leven', '2.1.0']])
        }
      ]
    ])
  ],
  [
    'jest-haste-map',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-haste-map-23.6.0-2e3eb997814ca696d62afdb3f2529f5bbc935e16/node_modules/jest-haste-map/'
          ),
          packageDependencies: new Map([
            ['fb-watchman', '2.0.0'],
            ['graceful-fs', '4.1.15'],
            ['invariant', '2.2.4'],
            ['jest-docblock', '23.2.0'],
            ['jest-serializer', '23.0.1'],
            ['jest-worker', '23.2.0'],
            ['micromatch', '2.3.11'],
            ['sane', '2.5.2'],
            ['jest-haste-map', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'fb-watchman',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fb-watchman-2.0.0-54e9abf7dfa2f26cd9b1636c588c1afc05de5d58/node_modules/fb-watchman/'
          ),
          packageDependencies: new Map([['bser', '2.0.0'], ['fb-watchman', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'bser',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-bser-2.0.0-9ac78d3ed5d915804fd87acb158bc797147a1719/node_modules/bser/'
          ),
          packageDependencies: new Map([['node-int64', '0.4.0'], ['bser', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'node-int64',
    new Map([
      [
        '0.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-node-int64-0.4.0-87a9065cdb355d3182d8f94ce11188b825c68a3b/node_modules/node-int64/'
          ),
          packageDependencies: new Map([['node-int64', '0.4.0']])
        }
      ]
    ])
  ],
  [
    'jest-docblock',
    new Map([
      [
        '23.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-docblock-23.2.0-f085e1f18548d99fdd69b20207e6fd55d91383a7/node_modules/jest-docblock/'
          ),
          packageDependencies: new Map([['detect-newline', '2.1.0'], ['jest-docblock', '23.2.0']])
        }
      ]
    ])
  ],
  [
    'detect-newline',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-detect-newline-2.1.0-f41f1c10be4b00e87b5f13da680759f2c5bfd3e2/node_modules/detect-newline/'
          ),
          packageDependencies: new Map([['detect-newline', '2.1.0']])
        }
      ]
    ])
  ],
  [
    'jest-serializer',
    new Map([
      [
        '23.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-serializer-23.0.1-a3776aeb311e90fe83fab9e533e85102bd164165/node_modules/jest-serializer/'
          ),
          packageDependencies: new Map([['jest-serializer', '23.0.1']])
        }
      ]
    ])
  ],
  [
    'jest-worker',
    new Map([
      [
        '23.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-worker-23.2.0-faf706a8da36fae60eb26957257fa7b5d8ea02b9/node_modules/jest-worker/'
          ),
          packageDependencies: new Map([['merge-stream', '1.0.1'], ['jest-worker', '23.2.0']])
        }
      ]
    ])
  ],
  [
    'merge-stream',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-merge-stream-1.0.1-4041202d508a342ba00174008df0c251b8c135e1/node_modules/merge-stream/'
          ),
          packageDependencies: new Map([['readable-stream', '2.3.6'], ['merge-stream', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'readable-stream',
    new Map([
      [
        '2.3.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/'
          ),
          packageDependencies: new Map([
            ['core-util-is', '1.0.2'],
            ['inherits', '2.0.3'],
            ['isarray', '1.0.0'],
            ['process-nextick-args', '2.0.0'],
            ['safe-buffer', '5.1.2'],
            ['string_decoder', '1.1.1'],
            ['util-deprecate', '1.0.2'],
            ['readable-stream', '2.3.6']
          ])
        }
      ]
    ])
  ],
  [
    'process-nextick-args',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-process-nextick-args-2.0.0-a37d732f4271b4ab1ad070d35508e8290788ffaa/node_modules/process-nextick-args/'
          ),
          packageDependencies: new Map([['process-nextick-args', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'string_decoder',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/'
          ),
          packageDependencies: new Map([['safe-buffer', '5.1.2'], ['string_decoder', '1.1.1']])
        }
      ]
    ])
  ],
  [
    'util-deprecate',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/'
          ),
          packageDependencies: new Map([['util-deprecate', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'sane',
    new Map([
      [
        '2.5.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-sane-2.5.2-b4dc1861c21b427e929507a3e751e2a2cb8ab3fa/node_modules/sane/'
          ),
          packageDependencies: new Map([
            ['anymatch', '2.0.0'],
            ['capture-exit', '1.2.0'],
            ['exec-sh', '0.2.2'],
            ['fb-watchman', '2.0.0'],
            ['micromatch', '3.1.10'],
            ['minimist', '1.2.0'],
            ['walker', '1.0.7'],
            ['watch', '0.18.0'],
            ['sane', '2.5.2']
          ])
        }
      ]
    ])
  ],
  [
    'anymatch',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/'
          ),
          packageDependencies: new Map([['micromatch', '3.1.10'], ['normalize-path', '2.1.1'], ['anymatch', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'extend-shallow',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/'
          ),
          packageDependencies: new Map([['is-extendable', '0.1.1'], ['extend-shallow', '2.0.1']])
        }
      ],
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/'
          ),
          packageDependencies: new Map([
            ['assign-symbols', '1.0.0'],
            ['is-extendable', '1.0.1'],
            ['extend-shallow', '3.0.2']
          ])
        }
      ]
    ])
  ],
  [
    'to-regex-range',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/'
          ),
          packageDependencies: new Map([
            ['is-number', '3.0.0'],
            ['repeat-string', '1.6.1'],
            ['to-regex-range', '2.1.1']
          ])
        }
      ]
    ])
  ],
  [
    'snapdragon',
    new Map([
      [
        '0.8.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/'
          ),
          packageDependencies: new Map([
            ['base', '0.11.2'],
            ['debug', '2.6.9'],
            ['define-property', '0.2.5'],
            ['extend-shallow', '2.0.1'],
            ['map-cache', '0.2.2'],
            ['source-map', '0.5.7'],
            ['source-map-resolve', '0.5.2'],
            ['use', '3.1.1'],
            ['snapdragon', '0.8.2']
          ])
        }
      ]
    ])
  ],
  [
    'base',
    new Map([
      [
        '0.11.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/'
          ),
          packageDependencies: new Map([
            ['cache-base', '1.0.1'],
            ['class-utils', '0.3.6'],
            ['component-emitter', '1.2.1'],
            ['define-property', '1.0.0'],
            ['isobject', '3.0.1'],
            ['mixin-deep', '1.3.1'],
            ['pascalcase', '0.1.1'],
            ['base', '0.11.2']
          ])
        }
      ]
    ])
  ],
  [
    'cache-base',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/'
          ),
          packageDependencies: new Map([
            ['collection-visit', '1.0.0'],
            ['component-emitter', '1.2.1'],
            ['get-value', '2.0.6'],
            ['has-value', '1.0.0'],
            ['isobject', '3.0.1'],
            ['set-value', '2.0.0'],
            ['to-object-path', '0.3.0'],
            ['union-value', '1.0.0'],
            ['unset-value', '1.0.0'],
            ['cache-base', '1.0.1']
          ])
        }
      ]
    ])
  ],
  [
    'collection-visit',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/'
          ),
          packageDependencies: new Map([
            ['map-visit', '1.0.0'],
            ['object-visit', '1.0.1'],
            ['collection-visit', '1.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'map-visit',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/'
          ),
          packageDependencies: new Map([['object-visit', '1.0.1'], ['map-visit', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'object-visit',
    new Map([
      [
        '1.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/'
          ),
          packageDependencies: new Map([['isobject', '3.0.1'], ['object-visit', '1.0.1']])
        }
      ]
    ])
  ],
  [
    'component-emitter',
    new Map([
      [
        '1.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-component-emitter-1.2.1-137918d6d78283f7df7a6b7c5a63e140e69425e6/node_modules/component-emitter/'
          ),
          packageDependencies: new Map([['component-emitter', '1.2.1']])
        }
      ]
    ])
  ],
  [
    'get-value',
    new Map([
      [
        '2.0.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/'
          ),
          packageDependencies: new Map([['get-value', '2.0.6']])
        }
      ]
    ])
  ],
  [
    'has-value',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/'
          ),
          packageDependencies: new Map([
            ['get-value', '2.0.6'],
            ['has-values', '1.0.0'],
            ['isobject', '3.0.1'],
            ['has-value', '1.0.0']
          ])
        }
      ],
      [
        '0.3.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/'
          ),
          packageDependencies: new Map([
            ['get-value', '2.0.6'],
            ['has-values', '0.1.4'],
            ['isobject', '2.1.0'],
            ['has-value', '0.3.1']
          ])
        }
      ]
    ])
  ],
  [
    'has-values',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/'
          ),
          packageDependencies: new Map([['is-number', '3.0.0'], ['kind-of', '4.0.0'], ['has-values', '1.0.0']])
        }
      ],
      [
        '0.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/'
          ),
          packageDependencies: new Map([['has-values', '0.1.4']])
        }
      ]
    ])
  ],
  [
    'set-value',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-set-value-2.0.0-71ae4a88f0feefbbf52d1ea604f3fb315ebb6274/node_modules/set-value/'
          ),
          packageDependencies: new Map([
            ['extend-shallow', '2.0.1'],
            ['is-extendable', '0.1.1'],
            ['is-plain-object', '2.0.4'],
            ['split-string', '3.1.0'],
            ['set-value', '2.0.0']
          ])
        }
      ],
      [
        '0.4.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-set-value-0.4.3-7db08f9d3d22dc7f78e53af3c3bf4666ecdfccf1/node_modules/set-value/'
          ),
          packageDependencies: new Map([
            ['extend-shallow', '2.0.1'],
            ['is-extendable', '0.1.1'],
            ['is-plain-object', '2.0.4'],
            ['to-object-path', '0.3.0'],
            ['set-value', '0.4.3']
          ])
        }
      ]
    ])
  ],
  [
    'is-plain-object',
    new Map([
      [
        '2.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/'
          ),
          packageDependencies: new Map([['isobject', '3.0.1'], ['is-plain-object', '2.0.4']])
        }
      ]
    ])
  ],
  [
    'split-string',
    new Map([
      [
        '3.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/'
          ),
          packageDependencies: new Map([['extend-shallow', '3.0.2'], ['split-string', '3.1.0']])
        }
      ]
    ])
  ],
  [
    'assign-symbols',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/'
          ),
          packageDependencies: new Map([['assign-symbols', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'to-object-path',
    new Map([
      [
        '0.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/'
          ),
          packageDependencies: new Map([['kind-of', '3.2.2'], ['to-object-path', '0.3.0']])
        }
      ]
    ])
  ],
  [
    'union-value',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-union-value-1.0.0-5c71c34cb5bad5dcebe3ea0cd08207ba5aa1aea4/node_modules/union-value/'
          ),
          packageDependencies: new Map([
            ['arr-union', '3.1.0'],
            ['get-value', '2.0.6'],
            ['is-extendable', '0.1.1'],
            ['set-value', '0.4.3'],
            ['union-value', '1.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'arr-union',
    new Map([
      [
        '3.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/'
          ),
          packageDependencies: new Map([['arr-union', '3.1.0']])
        }
      ]
    ])
  ],
  [
    'unset-value',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/'
          ),
          packageDependencies: new Map([['has-value', '0.3.1'], ['isobject', '3.0.1'], ['unset-value', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'class-utils',
    new Map([
      [
        '0.3.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/'
          ),
          packageDependencies: new Map([
            ['arr-union', '3.1.0'],
            ['define-property', '0.2.5'],
            ['isobject', '3.0.1'],
            ['static-extend', '0.1.2'],
            ['class-utils', '0.3.6']
          ])
        }
      ]
    ])
  ],
  [
    'define-property',
    new Map([
      [
        '0.2.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/'
          ),
          packageDependencies: new Map([['is-descriptor', '0.1.6'], ['define-property', '0.2.5']])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/'
          ),
          packageDependencies: new Map([['is-descriptor', '1.0.2'], ['define-property', '1.0.0']])
        }
      ],
      [
        '2.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/'
          ),
          packageDependencies: new Map([
            ['is-descriptor', '1.0.2'],
            ['isobject', '3.0.1'],
            ['define-property', '2.0.2']
          ])
        }
      ]
    ])
  ],
  [
    'is-descriptor',
    new Map([
      [
        '0.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/'
          ),
          packageDependencies: new Map([
            ['is-accessor-descriptor', '0.1.6'],
            ['is-data-descriptor', '0.1.4'],
            ['kind-of', '5.1.0'],
            ['is-descriptor', '0.1.6']
          ])
        }
      ],
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/'
          ),
          packageDependencies: new Map([
            ['is-accessor-descriptor', '1.0.0'],
            ['is-data-descriptor', '1.0.0'],
            ['kind-of', '6.0.2'],
            ['is-descriptor', '1.0.2']
          ])
        }
      ]
    ])
  ],
  [
    'is-accessor-descriptor',
    new Map([
      [
        '0.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/'
          ),
          packageDependencies: new Map([['kind-of', '3.2.2'], ['is-accessor-descriptor', '0.1.6']])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/'
          ),
          packageDependencies: new Map([['kind-of', '6.0.2'], ['is-accessor-descriptor', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'is-data-descriptor',
    new Map([
      [
        '0.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/'
          ),
          packageDependencies: new Map([['kind-of', '3.2.2'], ['is-data-descriptor', '0.1.4']])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/'
          ),
          packageDependencies: new Map([['kind-of', '6.0.2'], ['is-data-descriptor', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'static-extend',
    new Map([
      [
        '0.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/'
          ),
          packageDependencies: new Map([
            ['define-property', '0.2.5'],
            ['object-copy', '0.1.0'],
            ['static-extend', '0.1.2']
          ])
        }
      ]
    ])
  ],
  [
    'object-copy',
    new Map([
      [
        '0.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/'
          ),
          packageDependencies: new Map([
            ['copy-descriptor', '0.1.1'],
            ['define-property', '0.2.5'],
            ['kind-of', '3.2.2'],
            ['object-copy', '0.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'copy-descriptor',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/'
          ),
          packageDependencies: new Map([['copy-descriptor', '0.1.1']])
        }
      ]
    ])
  ],
  [
    'mixin-deep',
    new Map([
      [
        '1.3.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-mixin-deep-1.3.1-a49e7268dce1a0d9698e45326c5626df3543d0fe/node_modules/mixin-deep/'
          ),
          packageDependencies: new Map([['for-in', '1.0.2'], ['is-extendable', '1.0.1'], ['mixin-deep', '1.3.1']])
        }
      ]
    ])
  ],
  [
    'pascalcase',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/'
          ),
          packageDependencies: new Map([['pascalcase', '0.1.1']])
        }
      ]
    ])
  ],
  [
    'map-cache',
    new Map([
      [
        '0.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/'
          ),
          packageDependencies: new Map([['map-cache', '0.2.2']])
        }
      ]
    ])
  ],
  [
    'source-map-resolve',
    new Map([
      [
        '0.5.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/'
          ),
          packageDependencies: new Map([
            ['atob', '2.1.2'],
            ['decode-uri-component', '0.2.0'],
            ['resolve-url', '0.2.1'],
            ['source-map-url', '0.4.0'],
            ['urix', '0.1.0'],
            ['source-map-resolve', '0.5.2']
          ])
        }
      ]
    ])
  ],
  [
    'atob',
    new Map([
      [
        '2.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/'
          ),
          packageDependencies: new Map([['atob', '2.1.2']])
        }
      ]
    ])
  ],
  [
    'decode-uri-component',
    new Map([
      [
        '0.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/'
          ),
          packageDependencies: new Map([['decode-uri-component', '0.2.0']])
        }
      ]
    ])
  ],
  [
    'resolve-url',
    new Map([
      [
        '0.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/'
          ),
          packageDependencies: new Map([['resolve-url', '0.2.1']])
        }
      ]
    ])
  ],
  [
    'source-map-url',
    new Map([
      [
        '0.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/'
          ),
          packageDependencies: new Map([['source-map-url', '0.4.0']])
        }
      ]
    ])
  ],
  [
    'urix',
    new Map([
      [
        '0.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/'
          ),
          packageDependencies: new Map([['urix', '0.1.0']])
        }
      ]
    ])
  ],
  [
    'use',
    new Map([
      [
        '3.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/'
          ),
          packageDependencies: new Map([['use', '3.1.1']])
        }
      ]
    ])
  ],
  [
    'snapdragon-node',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/'
          ),
          packageDependencies: new Map([
            ['define-property', '1.0.0'],
            ['isobject', '3.0.1'],
            ['snapdragon-util', '3.0.1'],
            ['snapdragon-node', '2.1.1']
          ])
        }
      ]
    ])
  ],
  [
    'snapdragon-util',
    new Map([
      [
        '3.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/'
          ),
          packageDependencies: new Map([['kind-of', '3.2.2'], ['snapdragon-util', '3.0.1']])
        }
      ]
    ])
  ],
  [
    'to-regex',
    new Map([
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/'
          ),
          packageDependencies: new Map([
            ['define-property', '2.0.2'],
            ['extend-shallow', '3.0.2'],
            ['regex-not', '1.0.2'],
            ['safe-regex', '1.1.0'],
            ['to-regex', '3.0.2']
          ])
        }
      ]
    ])
  ],
  [
    'regex-not',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/'
          ),
          packageDependencies: new Map([['extend-shallow', '3.0.2'], ['safe-regex', '1.1.0'], ['regex-not', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'safe-regex',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/'
          ),
          packageDependencies: new Map([['ret', '0.1.15'], ['safe-regex', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'ret',
    new Map([
      [
        '0.1.15',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/'
          ),
          packageDependencies: new Map([['ret', '0.1.15']])
        }
      ]
    ])
  ],
  [
    'posix-character-classes',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/'
          ),
          packageDependencies: new Map([['posix-character-classes', '0.1.1']])
        }
      ]
    ])
  ],
  [
    'fragment-cache',
    new Map([
      [
        '0.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/'
          ),
          packageDependencies: new Map([['map-cache', '0.2.2'], ['fragment-cache', '0.2.1']])
        }
      ]
    ])
  ],
  [
    'nanomatch',
    new Map([
      [
        '1.2.13',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/'
          ),
          packageDependencies: new Map([
            ['arr-diff', '4.0.0'],
            ['array-unique', '0.3.2'],
            ['define-property', '2.0.2'],
            ['extend-shallow', '3.0.2'],
            ['fragment-cache', '0.2.1'],
            ['is-windows', '1.0.2'],
            ['kind-of', '6.0.2'],
            ['object.pick', '1.3.0'],
            ['regex-not', '1.0.2'],
            ['snapdragon', '0.8.2'],
            ['to-regex', '3.0.2'],
            ['nanomatch', '1.2.13']
          ])
        }
      ]
    ])
  ],
  [
    'is-windows',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/'
          ),
          packageDependencies: new Map([['is-windows', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'object.pick',
    new Map([
      [
        '1.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/'
          ),
          packageDependencies: new Map([['isobject', '3.0.1'], ['object.pick', '1.3.0']])
        }
      ]
    ])
  ],
  [
    'capture-exit',
    new Map([
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-capture-exit-1.2.0-1c5fcc489fd0ab00d4f1ac7ae1072e3173fbab6f/node_modules/capture-exit/'
          ),
          packageDependencies: new Map([['rsvp', '3.6.2'], ['capture-exit', '1.2.0']])
        }
      ]
    ])
  ],
  [
    'rsvp',
    new Map([
      [
        '3.6.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-rsvp-3.6.2-2e96491599a96cde1b515d5674a8f7a91452926a/node_modules/rsvp/'
          ),
          packageDependencies: new Map([['rsvp', '3.6.2']])
        }
      ]
    ])
  ],
  [
    'exec-sh',
    new Map([
      [
        '0.2.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-exec-sh-0.2.2-2a5e7ffcbd7d0ba2755bdecb16e5a427dfbdec36/node_modules/exec-sh/'
          ),
          packageDependencies: new Map([['merge', '1.2.1'], ['exec-sh', '0.2.2']])
        }
      ]
    ])
  ],
  [
    'merge',
    new Map([
      [
        '1.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-merge-1.2.1-38bebf80c3220a8a487b6fcfb3941bb11720c145/node_modules/merge/'
          ),
          packageDependencies: new Map([['merge', '1.2.1']])
        }
      ]
    ])
  ],
  [
    'walker',
    new Map([
      [
        '1.0.7',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-walker-1.0.7-2f7f9b8fd10d677262b18a884e28d19618e028fb/node_modules/walker/'
          ),
          packageDependencies: new Map([['makeerror', '1.0.11'], ['walker', '1.0.7']])
        }
      ]
    ])
  ],
  [
    'makeerror',
    new Map([
      [
        '1.0.11',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-makeerror-1.0.11-e01a5c9109f2af79660e4e8b9587790184f5a96c/node_modules/makeerror/'
          ),
          packageDependencies: new Map([['tmpl', '1.0.4'], ['makeerror', '1.0.11']])
        }
      ]
    ])
  ],
  [
    'tmpl',
    new Map([
      [
        '1.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-tmpl-1.0.4-23640dd7b42d00433911140820e5cf440e521dd1/node_modules/tmpl/'
          ),
          packageDependencies: new Map([['tmpl', '1.0.4']])
        }
      ]
    ])
  ],
  [
    'watch',
    new Map([
      [
        '0.18.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-watch-0.18.0-28095476c6df7c90c963138990c0a5423eb4b986/node_modules/watch/'
          ),
          packageDependencies: new Map([['exec-sh', '0.2.2'], ['minimist', '1.2.0'], ['watch', '0.18.0']])
        }
      ]
    ])
  ],
  [
    'jest-resolve-dependencies',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-resolve-dependencies-23.6.0-b4526af24c8540d9a3fab102c15081cf509b723d/node_modules/jest-resolve-dependencies/'
          ),
          packageDependencies: new Map([
            ['jest-regex-util', '23.3.0'],
            ['jest-snapshot', '23.6.0'],
            ['jest-resolve-dependencies', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-runner',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-runner-23.6.0-3894bd219ffc3f3cb94dc48a4170a2e6f23a5a38/node_modules/jest-runner/'
          ),
          packageDependencies: new Map([
            ['exit', '0.1.2'],
            ['graceful-fs', '4.1.15'],
            ['jest-config', '23.6.0'],
            ['jest-docblock', '23.2.0'],
            ['jest-haste-map', '23.6.0'],
            ['jest-jasmine2', '23.6.0'],
            ['jest-leak-detector', '23.6.0'],
            ['jest-message-util', '23.4.0'],
            ['jest-runtime', '23.6.0'],
            ['jest-util', '23.4.0'],
            ['jest-worker', '23.2.0'],
            ['source-map-support', '0.5.9'],
            ['throat', '4.1.0'],
            ['jest-runner', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-leak-detector',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-leak-detector-23.6.0-e4230fd42cf381a1a1971237ad56897de7e171de/node_modules/jest-leak-detector/'
          ),
          packageDependencies: new Map([['pretty-format', '23.6.0'], ['jest-leak-detector', '23.6.0']])
        }
      ]
    ])
  ],
  [
    'jest-runtime',
    new Map([
      [
        '23.6.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-runtime-23.6.0-059e58c8ab445917cd0e0d84ac2ba68de8f23082/node_modules/jest-runtime/'
          ),
          packageDependencies: new Map([
            ['babel-core', '6.26.3'],
            ['babel-plugin-istanbul', '4.1.6'],
            ['chalk', '2.4.1'],
            ['convert-source-map', '1.6.0'],
            ['exit', '0.1.2'],
            ['fast-json-stable-stringify', '2.0.0'],
            ['graceful-fs', '4.1.15'],
            ['jest-config', '23.6.0'],
            ['jest-haste-map', '23.6.0'],
            ['jest-message-util', '23.4.0'],
            ['jest-regex-util', '23.3.0'],
            ['jest-resolve', '23.6.0'],
            ['jest-snapshot', '23.6.0'],
            ['jest-util', '23.4.0'],
            ['jest-validate', '23.6.0'],
            ['micromatch', '2.3.11'],
            ['realpath-native', '1.0.2'],
            ['slash', '1.0.0'],
            ['strip-bom', '3.0.0'],
            ['write-file-atomic', '2.3.0'],
            ['yargs', '11.1.0'],
            ['jest-runtime', '23.6.0']
          ])
        }
      ]
    ])
  ],
  [
    'write-file-atomic',
    new Map([
      [
        '2.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-write-file-atomic-2.3.0-1ff61575c2e2a4e8e510d6fa4e243cce183999ab/node_modules/write-file-atomic/'
          ),
          packageDependencies: new Map([
            ['graceful-fs', '4.1.15'],
            ['imurmurhash', '0.1.4'],
            ['signal-exit', '3.0.2'],
            ['write-file-atomic', '2.3.0']
          ])
        }
      ]
    ])
  ],
  [
    'imurmurhash',
    new Map([
      [
        '0.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/'
          ),
          packageDependencies: new Map([['imurmurhash', '0.1.4']])
        }
      ]
    ])
  ],
  [
    'signal-exit',
    new Map([
      [
        '3.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/'
          ),
          packageDependencies: new Map([['signal-exit', '3.0.2']])
        }
      ]
    ])
  ],
  [
    'yargs',
    new Map([
      [
        '11.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-yargs-11.1.0-90b869934ed6e871115ea2ff58b03f4724ed2d77/node_modules/yargs/'
          ),
          packageDependencies: new Map([
            ['cliui', '4.1.0'],
            ['decamelize', '1.2.0'],
            ['find-up', '2.1.0'],
            ['get-caller-file', '1.0.3'],
            ['os-locale', '2.1.0'],
            ['require-directory', '2.1.1'],
            ['require-main-filename', '1.0.1'],
            ['set-blocking', '2.0.0'],
            ['string-width', '2.1.1'],
            ['which-module', '2.0.0'],
            ['y18n', '3.2.1'],
            ['yargs-parser', '9.0.2'],
            ['yargs', '11.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'cliui',
    new Map([
      [
        '4.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-cliui-4.1.0-348422dbe82d800b3022eef4f6ac10bf2e4d1b49/node_modules/cliui/'
          ),
          packageDependencies: new Map([
            ['string-width', '2.1.1'],
            ['strip-ansi', '4.0.0'],
            ['wrap-ansi', '2.1.0'],
            ['cliui', '4.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'string-width',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/'
          ),
          packageDependencies: new Map([
            ['is-fullwidth-code-point', '2.0.0'],
            ['strip-ansi', '4.0.0'],
            ['string-width', '2.1.1']
          ])
        }
      ],
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/'
          ),
          packageDependencies: new Map([
            ['code-point-at', '1.1.0'],
            ['is-fullwidth-code-point', '1.0.0'],
            ['strip-ansi', '3.0.1'],
            ['string-width', '1.0.2']
          ])
        }
      ]
    ])
  ],
  [
    'is-fullwidth-code-point',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/'
          ),
          packageDependencies: new Map([['is-fullwidth-code-point', '2.0.0']])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/'
          ),
          packageDependencies: new Map([['number-is-nan', '1.0.1'], ['is-fullwidth-code-point', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'wrap-ansi',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-wrap-ansi-2.1.0-d8fc3d284dd05794fe84973caecdd1cf824fdd85/node_modules/wrap-ansi/'
          ),
          packageDependencies: new Map([['string-width', '1.0.2'], ['strip-ansi', '3.0.1'], ['wrap-ansi', '2.1.0']])
        }
      ]
    ])
  ],
  [
    'code-point-at',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/'
          ),
          packageDependencies: new Map([['code-point-at', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'decamelize',
    new Map([
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-decamelize-1.2.0-f6534d15148269b20352e7bee26f501f9a191290/node_modules/decamelize/'
          ),
          packageDependencies: new Map([['decamelize', '1.2.0']])
        }
      ]
    ])
  ],
  [
    'get-caller-file',
    new Map([
      [
        '1.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-get-caller-file-1.0.3-f978fa4c90d1dfe7ff2d6beda2a515e713bdcf4a/node_modules/get-caller-file/'
          ),
          packageDependencies: new Map([['get-caller-file', '1.0.3']])
        }
      ]
    ])
  ],
  [
    'os-locale',
    new Map([
      [
        '2.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-os-locale-2.1.0-42bc2900a6b5b8bd17376c8e882b65afccf24bf2/node_modules/os-locale/'
          ),
          packageDependencies: new Map([
            ['execa', '0.7.0'],
            ['lcid', '1.0.0'],
            ['mem', '1.1.0'],
            ['os-locale', '2.1.0']
          ])
        }
      ]
    ])
  ],
  [
    'execa',
    new Map([
      [
        '0.7.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-execa-0.7.0-944becd34cc41ee32a63a9faf27ad5a65fc59777/node_modules/execa/'
          ),
          packageDependencies: new Map([
            ['cross-spawn', '5.1.0'],
            ['get-stream', '3.0.0'],
            ['is-stream', '1.1.0'],
            ['npm-run-path', '2.0.2'],
            ['p-finally', '1.0.0'],
            ['signal-exit', '3.0.2'],
            ['strip-eof', '1.0.0'],
            ['execa', '0.7.0']
          ])
        }
      ],
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-execa-1.0.0-c6236a5bb4df6d6f15e88e7f017798216749ddd8/node_modules/execa/'
          ),
          packageDependencies: new Map([
            ['cross-spawn', '6.0.5'],
            ['get-stream', '4.1.0'],
            ['is-stream', '1.1.0'],
            ['npm-run-path', '2.0.2'],
            ['p-finally', '1.0.0'],
            ['signal-exit', '3.0.2'],
            ['strip-eof', '1.0.0'],
            ['execa', '1.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'cross-spawn',
    new Map([
      [
        '5.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-cross-spawn-5.1.0-e8bd0efee58fcff6f8f94510a0a554bbfa235449/node_modules/cross-spawn/'
          ),
          packageDependencies: new Map([
            ['lru-cache', '4.1.4'],
            ['shebang-command', '1.2.0'],
            ['which', '1.3.1'],
            ['cross-spawn', '5.1.0']
          ])
        }
      ],
      [
        '6.0.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/'
          ),
          packageDependencies: new Map([
            ['nice-try', '1.0.5'],
            ['path-key', '2.0.1'],
            ['semver', '5.6.0'],
            ['shebang-command', '1.2.0'],
            ['which', '1.3.1'],
            ['cross-spawn', '6.0.5']
          ])
        }
      ]
    ])
  ],
  [
    'lru-cache',
    new Map([
      [
        '4.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-lru-cache-4.1.4-51cc46e8e6d9530771c857e24ccc720ecdbcc031/node_modules/lru-cache/'
          ),
          packageDependencies: new Map([['pseudomap', '1.0.2'], ['yallist', '3.0.3'], ['lru-cache', '4.1.4']])
        }
      ]
    ])
  ],
  [
    'pseudomap',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pseudomap-1.0.2-f052a28da70e618917ef0a8ac34c1ae5a68286b3/node_modules/pseudomap/'
          ),
          packageDependencies: new Map([['pseudomap', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'yallist',
    new Map([
      [
        '3.0.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-yallist-3.0.3-b4b049e314be545e3ce802236d6cd22cd91c3de9/node_modules/yallist/'
          ),
          packageDependencies: new Map([['yallist', '3.0.3']])
        }
      ]
    ])
  ],
  [
    'shebang-command',
    new Map([
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/'
          ),
          packageDependencies: new Map([['shebang-regex', '1.0.0'], ['shebang-command', '1.2.0']])
        }
      ]
    ])
  ],
  [
    'shebang-regex',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/'
          ),
          packageDependencies: new Map([['shebang-regex', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'which',
    new Map([
      [
        '1.3.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/'
          ),
          packageDependencies: new Map([['isexe', '2.0.0'], ['which', '1.3.1']])
        }
      ]
    ])
  ],
  [
    'isexe',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/'
          ),
          packageDependencies: new Map([['isexe', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'get-stream',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-get-stream-3.0.0-8e943d1358dc37555054ecbe2edb05aa174ede14/node_modules/get-stream/'
          ),
          packageDependencies: new Map([['get-stream', '3.0.0']])
        }
      ],
      [
        '4.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-get-stream-4.1.0-c1b255575f3dc21d59bfc79cd3d2b46b1c3a54b5/node_modules/get-stream/'
          ),
          packageDependencies: new Map([['pump', '3.0.0'], ['get-stream', '4.1.0']])
        }
      ]
    ])
  ],
  [
    'is-stream',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/'
          ),
          packageDependencies: new Map([['is-stream', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'npm-run-path',
    new Map([
      [
        '2.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/'
          ),
          packageDependencies: new Map([['path-key', '2.0.1'], ['npm-run-path', '2.0.2']])
        }
      ]
    ])
  ],
  [
    'path-key',
    new Map([
      [
        '2.0.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/'
          ),
          packageDependencies: new Map([['path-key', '2.0.1']])
        }
      ]
    ])
  ],
  [
    'p-finally',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/'
          ),
          packageDependencies: new Map([['p-finally', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'strip-eof',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/'
          ),
          packageDependencies: new Map([['strip-eof', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'lcid',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-lcid-1.0.0-308accafa0bc483a3867b4b6f2b9506251d1b835/node_modules/lcid/'
          ),
          packageDependencies: new Map([['invert-kv', '1.0.0'], ['lcid', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'invert-kv',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-invert-kv-1.0.0-104a8e4aaca6d3d8cd157a8ef8bfab2d7a3ffdb6/node_modules/invert-kv/'
          ),
          packageDependencies: new Map([['invert-kv', '1.0.0']])
        }
      ]
    ])
  ],
  [
    'mem',
    new Map([
      [
        '1.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-mem-1.1.0-5edd52b485ca1d900fe64895505399a0dfa45f76/node_modules/mem/'
          ),
          packageDependencies: new Map([['mimic-fn', '1.2.0'], ['mem', '1.1.0']])
        }
      ]
    ])
  ],
  [
    'mimic-fn',
    new Map([
      [
        '1.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-mimic-fn-1.2.0-820c86a39334640e99516928bd03fca88057d022/node_modules/mimic-fn/'
          ),
          packageDependencies: new Map([['mimic-fn', '1.2.0']])
        }
      ]
    ])
  ],
  [
    'require-directory',
    new Map([
      [
        '2.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-require-directory-2.1.1-8c64ad5fd30dab1c976e2344ffe7f792a6a6df42/node_modules/require-directory/'
          ),
          packageDependencies: new Map([['require-directory', '2.1.1']])
        }
      ]
    ])
  ],
  [
    'set-blocking',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/'
          ),
          packageDependencies: new Map([['set-blocking', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'which-module',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-which-module-2.0.0-d9ef07dce77b9902b8a3a8fa4b31c3e3f7e6e87a/node_modules/which-module/'
          ),
          packageDependencies: new Map([['which-module', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'y18n',
    new Map([
      [
        '3.2.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-y18n-3.2.1-6d15fba884c08679c0d77e88e7759e811e07fa41/node_modules/y18n/'
          ),
          packageDependencies: new Map([['y18n', '3.2.1']])
        }
      ]
    ])
  ],
  [
    'yargs-parser',
    new Map([
      [
        '9.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-yargs-parser-9.0.2-9ccf6a43460fe4ed40a9bb68f48d43b8a68cc077/node_modules/yargs-parser/'
          ),
          packageDependencies: new Map([['camelcase', '4.1.0'], ['yargs-parser', '9.0.2']])
        }
      ]
    ])
  ],
  [
    'camelcase',
    new Map([
      [
        '4.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-camelcase-4.1.0-d545635be1e33c542649c69173e5de6acfae34dd/node_modules/camelcase/'
          ),
          packageDependencies: new Map([['camelcase', '4.1.0']])
        }
      ]
    ])
  ],
  [
    'buffer-from',
    new Map([
      [
        '1.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-buffer-from-1.1.1-32713bc028f75c02fdb710d7c7bcec1f2c6070ef/node_modules/buffer-from/'
          ),
          packageDependencies: new Map([['buffer-from', '1.1.1']])
        }
      ]
    ])
  ],
  [
    'node-notifier',
    new Map([
      [
        '5.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-node-notifier-5.3.0-c77a4a7b84038733d5fb351aafd8a268bfe19a01/node_modules/node-notifier/'
          ),
          packageDependencies: new Map([
            ['growly', '1.3.0'],
            ['semver', '5.6.0'],
            ['shellwords', '0.1.1'],
            ['which', '1.3.1'],
            ['node-notifier', '5.3.0']
          ])
        }
      ]
    ])
  ],
  [
    'growly',
    new Map([
      [
        '1.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-growly-1.3.0-f10748cbe76af964b7c96c93c6bcc28af120c081/node_modules/growly/'
          ),
          packageDependencies: new Map([['growly', '1.3.0']])
        }
      ]
    ])
  ],
  [
    'shellwords',
    new Map([
      [
        '0.1.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-shellwords-0.1.1-d6b9181c1a48d397324c84871efbcfc73fc0654b/node_modules/shellwords/'
          ),
          packageDependencies: new Map([['shellwords', '0.1.1']])
        }
      ]
    ])
  ],
  [
    'string-length',
    new Map([
      [
        '2.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-string-length-2.0.0-d40dbb686a3ace960c1cffca562bf2c45f8363ed/node_modules/string-length/'
          ),
          packageDependencies: new Map([['astral-regex', '1.0.0'], ['strip-ansi', '4.0.0'], ['string-length', '2.0.0']])
        }
      ]
    ])
  ],
  [
    'astral-regex',
    new Map([
      [
        '1.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9/node_modules/astral-regex/'
          ),
          packageDependencies: new Map([['astral-regex', '1.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/core',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-core-7.1.6-3733cbee4317429bc87c62b29cf8587dba7baeb3/node_modules/@babel/core/'
          ),
          packageDependencies: new Map([
            ['@babel/code-frame', '7.0.0'],
            ['@babel/generator', '7.1.6'],
            ['@babel/helpers', '7.1.5'],
            ['@babel/parser', '7.1.6'],
            ['@babel/template', '7.1.2'],
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['convert-source-map', '1.6.0'],
            ['debug', '4.1.0'],
            ['json5', '2.1.0'],
            ['lodash', '4.17.11'],
            ['resolve', '1.8.1'],
            ['semver', '5.6.0'],
            ['source-map', '0.5.7'],
            ['@babel/core', '7.1.6']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/generator',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-generator-7.1.6-001303cf87a5b9d093494a4bf251d7b5d03d3999/node_modules/@babel/generator/'
          ),
          packageDependencies: new Map([
            ['@babel/types', '7.1.6'],
            ['jsesc', '2.5.2'],
            ['lodash', '4.17.11'],
            ['source-map', '0.5.7'],
            ['trim-right', '1.0.1'],
            ['@babel/generator', '7.1.6']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/types',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-types-7.1.6-0adb330c3a281348a190263aceb540e10f04bcce/node_modules/@babel/types/'
          ),
          packageDependencies: new Map([
            ['esutils', '2.0.2'],
            ['lodash', '4.17.11'],
            ['to-fast-properties', '2.0.0'],
            ['@babel/types', '7.1.6']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helpers',
    new Map([
      [
        '7.1.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helpers-7.1.5-68bfc1895d685f2b8f1995e788dbfe1f6ccb1996/node_modules/@babel/helpers/'
          ),
          packageDependencies: new Map([
            ['@babel/template', '7.1.2'],
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/helpers', '7.1.5']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/template',
    new Map([
      [
        '7.1.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-template-7.1.2-090484a574fef5a2d2d7726a674eceda5c5b5644/node_modules/@babel/template/'
          ),
          packageDependencies: new Map([
            ['@babel/code-frame', '7.0.0'],
            ['@babel/parser', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/template', '7.1.2']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/parser',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-parser-7.1.6-16e97aca1ec1062324a01c5a6a7d0df8dd189854/node_modules/@babel/parser/'
          ),
          packageDependencies: new Map([['@babel/parser', '7.1.6']])
        }
      ]
    ])
  ],
  [
    '@babel/traverse',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-traverse-7.1.6-c8db9963ab4ce5b894222435482bd8ea854b7b5c/node_modules/@babel/traverse/'
          ),
          packageDependencies: new Map([
            ['@babel/code-frame', '7.0.0'],
            ['@babel/generator', '7.1.6'],
            ['@babel/helper-function-name', '7.1.0'],
            ['@babel/helper-split-export-declaration', '7.0.0'],
            ['@babel/parser', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['debug', '4.1.0'],
            ['globals', '11.9.0'],
            ['lodash', '4.17.11'],
            ['@babel/traverse', '7.1.6']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-function-name',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-function-name-7.1.0-a0ceb01685f73355d4360c1247f582bfafc8ff53/node_modules/@babel/helper-function-name/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-get-function-arity', '7.0.0'],
            ['@babel/template', '7.1.2'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-function-name', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-get-function-arity',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-get-function-arity-7.0.0-83572d4320e2a4657263734113c42868b64e49c3/node_modules/@babel/helper-get-function-arity/'
          ),
          packageDependencies: new Map([['@babel/types', '7.1.6'], ['@babel/helper-get-function-arity', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/helper-split-export-declaration',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-split-export-declaration-7.0.0-3aae285c0311c2ab095d997b8c9a94cad547d813/node_modules/@babel/helper-split-export-declaration/'
          ),
          packageDependencies: new Map([['@babel/types', '7.1.6'], ['@babel/helper-split-export-declaration', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/preset-env',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-preset-env-7.1.6-a0bf4b96b6bfcf6e000afc5b72b4abe7cc13ae97/node_modules/@babel/preset-env/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-module-imports', '7.0.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-proposal-async-generator-functions', '7.1.0'],
            ['@babel/plugin-proposal-json-strings', '7.0.0'],
            ['@babel/plugin-proposal-object-rest-spread', '7.0.0'],
            ['@babel/plugin-proposal-optional-catch-binding', '7.0.0'],
            ['@babel/plugin-proposal-unicode-property-regex', '7.0.0'],
            ['@babel/plugin-syntax-async-generators', 'pnp:2fcc5c9b6d95aef842f0ddcf8012983018578bda'],
            ['@babel/plugin-syntax-object-rest-spread', 'pnp:c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e'],
            ['@babel/plugin-syntax-optional-catch-binding', 'pnp:d8fabc0f71e09f7047d8576625a0959fc0684dcd'],
            ['@babel/plugin-transform-arrow-functions', '7.0.0'],
            ['@babel/plugin-transform-async-to-generator', '7.1.0'],
            ['@babel/plugin-transform-block-scoped-functions', '7.0.0'],
            ['@babel/plugin-transform-block-scoping', '7.1.5'],
            ['@babel/plugin-transform-classes', '7.1.0'],
            ['@babel/plugin-transform-computed-properties', '7.0.0'],
            ['@babel/plugin-transform-destructuring', '7.1.3'],
            ['@babel/plugin-transform-dotall-regex', '7.0.0'],
            ['@babel/plugin-transform-duplicate-keys', '7.0.0'],
            ['@babel/plugin-transform-exponentiation-operator', '7.1.0'],
            ['@babel/plugin-transform-for-of', '7.0.0'],
            ['@babel/plugin-transform-function-name', '7.1.0'],
            ['@babel/plugin-transform-literals', '7.0.0'],
            ['@babel/plugin-transform-modules-amd', '7.1.0'],
            ['@babel/plugin-transform-modules-commonjs', '7.1.0'],
            ['@babel/plugin-transform-modules-systemjs', '7.1.3'],
            ['@babel/plugin-transform-modules-umd', '7.1.0'],
            ['@babel/plugin-transform-new-target', '7.0.0'],
            ['@babel/plugin-transform-object-super', '7.1.0'],
            ['@babel/plugin-transform-parameters', '7.1.0'],
            ['@babel/plugin-transform-regenerator', '7.0.0'],
            ['@babel/plugin-transform-shorthand-properties', '7.0.0'],
            ['@babel/plugin-transform-spread', '7.0.0'],
            ['@babel/plugin-transform-sticky-regex', '7.0.0'],
            ['@babel/plugin-transform-template-literals', '7.0.0'],
            ['@babel/plugin-transform-typeof-symbol', '7.0.0'],
            ['@babel/plugin-transform-unicode-regex', '7.0.0'],
            ['browserslist', '4.3.4'],
            ['invariant', '2.2.4'],
            ['js-levenshtein', '1.1.4'],
            ['semver', '5.6.0'],
            ['@babel/preset-env', '7.1.6']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-module-imports',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-module-imports-7.0.0-96081b7111e486da4d2cd971ad1a4fe216cc2e3d/node_modules/@babel/helper-module-imports/'
          ),
          packageDependencies: new Map([['@babel/types', '7.1.6'], ['@babel/helper-module-imports', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/helper-plugin-utils',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-plugin-utils-7.0.0-bbb3fbee98661c569034237cc03967ba99b4f250/node_modules/@babel/helper-plugin-utils/'
          ),
          packageDependencies: new Map([['@babel/helper-plugin-utils', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-proposal-async-generator-functions',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-async-generator-functions-7.1.0-41c1a702e10081456e23a7b74d891922dd1bb6ce/node_modules/@babel/plugin-proposal-async-generator-functions/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-remap-async-to-generator', '7.1.0'],
            ['@babel/plugin-syntax-async-generators', 'pnp:700ef535efb74f629e1d4179b7c087ca71598812'],
            ['@babel/plugin-proposal-async-generator-functions', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-remap-async-to-generator',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-remap-async-to-generator-7.1.0-361d80821b6f38da75bd3f0785ece20a88c5fe7f/node_modules/@babel/helper-remap-async-to-generator/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-annotate-as-pure', '7.0.0'],
            ['@babel/helper-wrap-function', '7.1.0'],
            ['@babel/template', '7.1.2'],
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-remap-async-to-generator', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-annotate-as-pure',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-annotate-as-pure-7.0.0-323d39dd0b50e10c7c06ca7d7638e6864d8c5c32/node_modules/@babel/helper-annotate-as-pure/'
          ),
          packageDependencies: new Map([['@babel/types', '7.1.6'], ['@babel/helper-annotate-as-pure', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/helper-wrap-function',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-wrap-function-7.1.0-8cf54e9190706067f016af8f75cb3df829cc8c66/node_modules/@babel/helper-wrap-function/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-function-name', '7.1.0'],
            ['@babel/template', '7.1.2'],
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-wrap-function', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-syntax-async-generators',
    new Map([
      [
        'pnp:700ef535efb74f629e1d4179b7c087ca71598812',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-700ef535efb74f629e1d4179b7c087ca71598812/node_modules/@babel/plugin-syntax-async-generators/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-async-generators', 'pnp:700ef535efb74f629e1d4179b7c087ca71598812']
          ])
        }
      ],
      [
        'pnp:2fcc5c9b6d95aef842f0ddcf8012983018578bda',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-2fcc5c9b6d95aef842f0ddcf8012983018578bda/node_modules/@babel/plugin-syntax-async-generators/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-async-generators', 'pnp:2fcc5c9b6d95aef842f0ddcf8012983018578bda']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-proposal-json-strings',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-json-strings-7.0.0-3b4d7b5cf51e1f2e70f52351d28d44fc2970d01e/node_modules/@babel/plugin-proposal-json-strings/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-json-strings', '7.0.0'],
            ['@babel/plugin-proposal-json-strings', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-syntax-json-strings',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-syntax-json-strings-7.0.0-0d259a68090e15b383ce3710e01d5b23f3770cbd/node_modules/@babel/plugin-syntax-json-strings/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-json-strings', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-proposal-object-rest-spread',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-object-rest-spread-7.0.0-9a17b547f64d0676b6c9cecd4edf74a82ab85e7e/node_modules/@babel/plugin-proposal-object-rest-spread/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-object-rest-spread', 'pnp:1bf85085bb7bcebf7ec5585626babe5a0a899875'],
            ['@babel/plugin-proposal-object-rest-spread', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-syntax-object-rest-spread',
    new Map([
      [
        'pnp:1bf85085bb7bcebf7ec5585626babe5a0a899875',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-1bf85085bb7bcebf7ec5585626babe5a0a899875/node_modules/@babel/plugin-syntax-object-rest-spread/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-object-rest-spread', 'pnp:1bf85085bb7bcebf7ec5585626babe5a0a899875']
          ])
        }
      ],
      [
        'pnp:c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e/node_modules/@babel/plugin-syntax-object-rest-spread/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-object-rest-spread', 'pnp:c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-proposal-optional-catch-binding',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-optional-catch-binding-7.0.0-b610d928fe551ff7117d42c8bb410eec312a6425/node_modules/@babel/plugin-proposal-optional-catch-binding/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-optional-catch-binding', 'pnp:e41313624e174e2a0226f94e9c37d10479b9c671'],
            ['@babel/plugin-proposal-optional-catch-binding', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-syntax-optional-catch-binding',
    new Map([
      [
        'pnp:e41313624e174e2a0226f94e9c37d10479b9c671',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-e41313624e174e2a0226f94e9c37d10479b9c671/node_modules/@babel/plugin-syntax-optional-catch-binding/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-optional-catch-binding', 'pnp:e41313624e174e2a0226f94e9c37d10479b9c671']
          ])
        }
      ],
      [
        'pnp:d8fabc0f71e09f7047d8576625a0959fc0684dcd',
        {
          packageLocation: path.resolve(
            __dirname,
            './.pnp/externals/pnp-d8fabc0f71e09f7047d8576625a0959fc0684dcd/node_modules/@babel/plugin-syntax-optional-catch-binding/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-optional-catch-binding', 'pnp:d8fabc0f71e09f7047d8576625a0959fc0684dcd']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-proposal-unicode-property-regex',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-unicode-property-regex-7.0.0-498b39cd72536cd7c4b26177d030226eba08cd33/node_modules/@babel/plugin-proposal-unicode-property-regex/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-regex', '7.0.0'],
            ['regexpu-core', '4.2.0'],
            ['@babel/plugin-proposal-unicode-property-regex', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-regex',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-regex-7.0.0-2c1718923b57f9bbe64705ffe5640ac64d9bdb27/node_modules/@babel/helper-regex/'
          ),
          packageDependencies: new Map([['lodash', '4.17.11'], ['@babel/helper-regex', '7.0.0']])
        }
      ]
    ])
  ],
  [
    'regexpu-core',
    new Map([
      [
        '4.2.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regexpu-core-4.2.0-a3744fa03806cffe146dea4421a3e73bdcc47b1d/node_modules/regexpu-core/'
          ),
          packageDependencies: new Map([
            ['regenerate', '1.4.0'],
            ['regenerate-unicode-properties', '7.0.0'],
            ['regjsgen', '0.4.0'],
            ['regjsparser', '0.3.0'],
            ['unicode-match-property-ecmascript', '1.0.4'],
            ['unicode-match-property-value-ecmascript', '1.0.2'],
            ['regexpu-core', '4.2.0']
          ])
        }
      ]
    ])
  ],
  [
    'regenerate',
    new Map([
      [
        '1.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regenerate-1.4.0-4a856ec4b56e4077c557589cae85e7a4c8869a11/node_modules/regenerate/'
          ),
          packageDependencies: new Map([['regenerate', '1.4.0']])
        }
      ]
    ])
  ],
  [
    'regenerate-unicode-properties',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regenerate-unicode-properties-7.0.0-107405afcc4a190ec5ed450ecaa00ed0cafa7a4c/node_modules/regenerate-unicode-properties/'
          ),
          packageDependencies: new Map([['regenerate', '1.4.0'], ['regenerate-unicode-properties', '7.0.0']])
        }
      ]
    ])
  ],
  [
    'regjsgen',
    new Map([
      [
        '0.4.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regjsgen-0.4.0-c1eb4c89a209263f8717c782591523913ede2561/node_modules/regjsgen/'
          ),
          packageDependencies: new Map([['regjsgen', '0.4.0']])
        }
      ]
    ])
  ],
  [
    'regjsparser',
    new Map([
      [
        '0.3.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regjsparser-0.3.0-3c326da7fcfd69fa0d332575a41c8c0cdf588c96/node_modules/regjsparser/'
          ),
          packageDependencies: new Map([['jsesc', '0.5.0'], ['regjsparser', '0.3.0']])
        }
      ]
    ])
  ],
  [
    'unicode-match-property-ecmascript',
    new Map([
      [
        '1.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-unicode-match-property-ecmascript-1.0.4-8ed2a32569961bce9227d09cd3ffbb8fed5f020c/node_modules/unicode-match-property-ecmascript/'
          ),
          packageDependencies: new Map([
            ['unicode-canonical-property-names-ecmascript', '1.0.4'],
            ['unicode-property-aliases-ecmascript', '1.0.4'],
            ['unicode-match-property-ecmascript', '1.0.4']
          ])
        }
      ]
    ])
  ],
  [
    'unicode-canonical-property-names-ecmascript',
    new Map([
      [
        '1.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-unicode-canonical-property-names-ecmascript-1.0.4-2619800c4c825800efdd8343af7dd9933cbe2818/node_modules/unicode-canonical-property-names-ecmascript/'
          ),
          packageDependencies: new Map([['unicode-canonical-property-names-ecmascript', '1.0.4']])
        }
      ]
    ])
  ],
  [
    'unicode-property-aliases-ecmascript',
    new Map([
      [
        '1.0.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-unicode-property-aliases-ecmascript-1.0.4-5a533f31b4317ea76f17d807fa0d116546111dd0/node_modules/unicode-property-aliases-ecmascript/'
          ),
          packageDependencies: new Map([['unicode-property-aliases-ecmascript', '1.0.4']])
        }
      ]
    ])
  ],
  [
    'unicode-match-property-value-ecmascript',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-unicode-match-property-value-ecmascript-1.0.2-9f1dc76926d6ccf452310564fd834ace059663d4/node_modules/unicode-match-property-value-ecmascript/'
          ),
          packageDependencies: new Map([['unicode-match-property-value-ecmascript', '1.0.2']])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-arrow-functions',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-arrow-functions-7.0.0-a6c14875848c68a3b4b3163a486535ef25c7e749/node_modules/@babel/plugin-transform-arrow-functions/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-arrow-functions', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-async-to-generator',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-async-to-generator-7.1.0-109e036496c51dd65857e16acab3bafdf3c57811/node_modules/@babel/plugin-transform-async-to-generator/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-module-imports', '7.0.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-remap-async-to-generator', '7.1.0'],
            ['@babel/plugin-transform-async-to-generator', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-block-scoped-functions',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-block-scoped-functions-7.0.0-482b3f75103927e37288b3b67b65f848e2aa0d07/node_modules/@babel/plugin-transform-block-scoped-functions/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-block-scoped-functions', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-block-scoping',
    new Map([
      [
        '7.1.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-block-scoping-7.1.5-3e8e0bc9a5104519923302a24f748f72f2f61f37/node_modules/@babel/plugin-transform-block-scoping/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['lodash', '4.17.11'],
            ['@babel/plugin-transform-block-scoping', '7.1.5']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-classes',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-classes-7.1.0-ab3f8a564361800cbc8ab1ca6f21108038432249/node_modules/@babel/plugin-transform-classes/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-annotate-as-pure', '7.0.0'],
            ['@babel/helper-define-map', '7.1.0'],
            ['@babel/helper-function-name', '7.1.0'],
            ['@babel/helper-optimise-call-expression', '7.0.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-replace-supers', '7.1.0'],
            ['@babel/helper-split-export-declaration', '7.0.0'],
            ['globals', '11.9.0'],
            ['@babel/plugin-transform-classes', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-define-map',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-define-map-7.1.0-3b74caec329b3c80c116290887c0dd9ae468c20c/node_modules/@babel/helper-define-map/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-function-name', '7.1.0'],
            ['@babel/types', '7.1.6'],
            ['lodash', '4.17.11'],
            ['@babel/helper-define-map', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-optimise-call-expression',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-optimise-call-expression-7.0.0-a2920c5702b073c15de51106200aa8cad20497d5/node_modules/@babel/helper-optimise-call-expression/'
          ),
          packageDependencies: new Map([['@babel/types', '7.1.6'], ['@babel/helper-optimise-call-expression', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/helper-replace-supers',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-replace-supers-7.1.0-5fc31de522ec0ef0899dc9b3e7cf6a5dd655f362/node_modules/@babel/helper-replace-supers/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-member-expression-to-functions', '7.0.0'],
            ['@babel/helper-optimise-call-expression', '7.0.0'],
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-replace-supers', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-member-expression-to-functions',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-member-expression-to-functions-7.0.0-8cd14b0a0df7ff00f009e7d7a436945f47c7a16f/node_modules/@babel/helper-member-expression-to-functions/'
          ),
          packageDependencies: new Map([
            ['@babel/types', '7.1.6'],
            ['@babel/helper-member-expression-to-functions', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-computed-properties',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-computed-properties-7.0.0-2fbb8900cd3e8258f2a2ede909b90e7556185e31/node_modules/@babel/plugin-transform-computed-properties/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-computed-properties', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-destructuring',
    new Map([
      [
        '7.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-destructuring-7.1.3-e69ff50ca01fac6cb72863c544e516c2b193012f/node_modules/@babel/plugin-transform-destructuring/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-destructuring', '7.1.3']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-dotall-regex',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-dotall-regex-7.0.0-73a24da69bc3c370251f43a3d048198546115e58/node_modules/@babel/plugin-transform-dotall-regex/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-regex', '7.0.0'],
            ['regexpu-core', '4.2.0'],
            ['@babel/plugin-transform-dotall-regex', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-duplicate-keys',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-duplicate-keys-7.0.0-a0601e580991e7cace080e4cf919cfd58da74e86/node_modules/@babel/plugin-transform-duplicate-keys/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-duplicate-keys', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-exponentiation-operator',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-exponentiation-operator-7.1.0-9c34c2ee7fd77e02779cfa37e403a2e1003ccc73/node_modules/@babel/plugin-transform-exponentiation-operator/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-builder-binary-assignment-operator-visitor', '7.1.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-exponentiation-operator', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-builder-binary-assignment-operator-visitor',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-builder-binary-assignment-operator-visitor-7.1.0-6b69628dfe4087798e0c4ed98e3d4a6b2fbd2f5f/node_modules/@babel/helper-builder-binary-assignment-operator-visitor/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-explode-assignable-expression', '7.1.0'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-builder-binary-assignment-operator-visitor', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-explode-assignable-expression',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-explode-assignable-expression-7.1.0-537fa13f6f1674df745b0c00ec8fe4e99681c8f6/node_modules/@babel/helper-explode-assignable-expression/'
          ),
          packageDependencies: new Map([
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-explode-assignable-expression', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-for-of',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-for-of-7.0.0-f2ba4eadb83bd17dc3c7e9b30f4707365e1c3e39/node_modules/@babel/plugin-transform-for-of/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-for-of', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-function-name',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-function-name-7.1.0-29c5550d5c46208e7f730516d41eeddd4affadbb/node_modules/@babel/plugin-transform-function-name/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-function-name', '7.1.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-function-name', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-literals',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-literals-7.0.0-2aec1d29cdd24c407359c930cdd89e914ee8ff86/node_modules/@babel/plugin-transform-literals/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-literals', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-modules-amd',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-amd-7.1.0-f9e0a7072c12e296079b5a59f408ff5b97bf86a8/node_modules/@babel/plugin-transform-modules-amd/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-module-transforms', '7.1.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-modules-amd', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-module-transforms',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-module-transforms-7.1.0-470d4f9676d9fad50b324cdcce5fbabbc3da5787/node_modules/@babel/helper-module-transforms/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-module-imports', '7.0.0'],
            ['@babel/helper-simple-access', '7.1.0'],
            ['@babel/helper-split-export-declaration', '7.0.0'],
            ['@babel/template', '7.1.2'],
            ['@babel/types', '7.1.6'],
            ['lodash', '4.17.11'],
            ['@babel/helper-module-transforms', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-simple-access',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-simple-access-7.1.0-65eeb954c8c245beaa4e859da6188f39d71e585c/node_modules/@babel/helper-simple-access/'
          ),
          packageDependencies: new Map([
            ['@babel/template', '7.1.2'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-simple-access', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-modules-commonjs',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-commonjs-7.1.0-0a9d86451cbbfb29bd15186306897c67f6f9a05c/node_modules/@babel/plugin-transform-modules-commonjs/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-module-transforms', '7.1.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-simple-access', '7.1.0'],
            ['@babel/plugin-transform-modules-commonjs', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-modules-systemjs',
    new Map([
      [
        '7.1.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-systemjs-7.1.3-2119a3e3db612fd74a19d88652efbfe9613a5db0/node_modules/@babel/plugin-transform-modules-systemjs/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-hoist-variables', '7.0.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-modules-systemjs', '7.1.3']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-hoist-variables',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-hoist-variables-7.0.0-46adc4c5e758645ae7a45deb92bab0918c23bb88/node_modules/@babel/helper-hoist-variables/'
          ),
          packageDependencies: new Map([['@babel/types', '7.1.6'], ['@babel/helper-hoist-variables', '7.0.0']])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-modules-umd',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-umd-7.1.0-a29a7d85d6f28c3561c33964442257cc6a21f2a8/node_modules/@babel/plugin-transform-modules-umd/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-module-transforms', '7.1.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-modules-umd', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-new-target',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-new-target-7.0.0-ae8fbd89517fa7892d20e6564e641e8770c3aa4a/node_modules/@babel/plugin-transform-new-target/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-new-target', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-object-super',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-object-super-7.1.0-b1ae194a054b826d8d4ba7ca91486d4ada0f91bb/node_modules/@babel/plugin-transform-object-super/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-replace-supers', '7.1.0'],
            ['@babel/plugin-transform-object-super', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-parameters',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-parameters-7.1.0-44f492f9d618c9124026e62301c296bf606a7aed/node_modules/@babel/plugin-transform-parameters/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-call-delegate', '7.1.0'],
            ['@babel/helper-get-function-arity', '7.0.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-parameters', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/helper-call-delegate',
    new Map([
      [
        '7.1.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-call-delegate-7.1.0-6a957f105f37755e8645343d3038a22e1449cc4a/node_modules/@babel/helper-call-delegate/'
          ),
          packageDependencies: new Map([
            ['@babel/helper-hoist-variables', '7.0.0'],
            ['@babel/traverse', '7.1.6'],
            ['@babel/types', '7.1.6'],
            ['@babel/helper-call-delegate', '7.1.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-regenerator',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-regenerator-7.0.0-5b41686b4ed40bef874d7ed6a84bdd849c13e0c1/node_modules/@babel/plugin-transform-regenerator/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['regenerator-transform', '0.13.3'],
            ['@babel/plugin-transform-regenerator', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'regenerator-transform',
    new Map([
      [
        '0.13.3',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-regenerator-transform-0.13.3-264bd9ff38a8ce24b06e0636496b2c856b57bcbb/node_modules/regenerator-transform/'
          ),
          packageDependencies: new Map([['private', '0.1.8'], ['regenerator-transform', '0.13.3']])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-shorthand-properties',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-shorthand-properties-7.0.0-85f8af592dcc07647541a0350e8c95c7bf419d15/node_modules/@babel/plugin-transform-shorthand-properties/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-shorthand-properties', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-spread',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-spread-7.0.0-93583ce48dd8c85e53f3a46056c856e4af30b49b/node_modules/@babel/plugin-transform-spread/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-spread', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-sticky-regex',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-sticky-regex-7.0.0-30a9d64ac2ab46eec087b8530535becd90e73366/node_modules/@babel/plugin-transform-sticky-regex/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-regex', '7.0.0'],
            ['@babel/plugin-transform-sticky-regex', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-template-literals',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-template-literals-7.0.0-084f1952efe5b153ddae69eb8945f882c7a97c65/node_modules/@babel/plugin-transform-template-literals/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-annotate-as-pure', '7.0.0'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-template-literals', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-typeof-symbol',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-typeof-symbol-7.0.0-4dcf1e52e943e5267b7313bff347fdbe0f81cec9/node_modules/@babel/plugin-transform-typeof-symbol/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-typeof-symbol', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-unicode-regex',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-unicode-regex-7.0.0-c6780e5b1863a76fe792d90eded9fcd5b51d68fc/node_modules/@babel/plugin-transform-unicode-regex/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/helper-regex', '7.0.0'],
            ['regexpu-core', '4.2.0'],
            ['@babel/plugin-transform-unicode-regex', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'browserslist',
    new Map([
      [
        '4.3.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-browserslist-4.3.4-4477b737db6a1b07077275b24791e680d4300425/node_modules/browserslist/'
          ),
          packageDependencies: new Map([
            ['caniuse-lite', '1.0.30000912'],
            ['electron-to-chromium', '1.3.85'],
            ['node-releases', '1.0.5'],
            ['browserslist', '4.3.4']
          ])
        }
      ]
    ])
  ],
  [
    'caniuse-lite',
    new Map([
      [
        '1.0.30000912',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-caniuse-lite-1.0.30000912-08e650d4090a9c0ab06bfd2b46b7d3ad6dcaea28/node_modules/caniuse-lite/'
          ),
          packageDependencies: new Map([['caniuse-lite', '1.0.30000912']])
        }
      ]
    ])
  ],
  [
    'electron-to-chromium',
    new Map([
      [
        '1.3.85',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-electron-to-chromium-1.3.85-5c46f790aa96445cabc57eb9d17346b1e46476fe/node_modules/electron-to-chromium/'
          ),
          packageDependencies: new Map([['electron-to-chromium', '1.3.85']])
        }
      ]
    ])
  ],
  [
    'node-releases',
    new Map([
      [
        '1.0.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-node-releases-1.0.5-a641adcc968b039a27345d92ef10b093e5cbd41d/node_modules/node-releases/'
          ),
          packageDependencies: new Map([['semver', '5.6.0'], ['node-releases', '1.0.5']])
        }
      ]
    ])
  ],
  [
    'js-levenshtein',
    new Map([
      [
        '1.1.4',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-js-levenshtein-1.1.4-3a56e3cbf589ca0081eb22cd9ba0b1290a16d26e/node_modules/js-levenshtein/'
          ),
          packageDependencies: new Map([['js-levenshtein', '1.1.4']])
        }
      ]
    ])
  ],
  [
    '@babel/preset-flow',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-preset-flow-7.0.0-afd764835d9535ec63d8c7d4caf1c06457263da2/node_modules/@babel/preset-flow/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-transform-flow-strip-types', '7.1.6'],
            ['@babel/preset-flow', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-transform-flow-strip-types',
    new Map([
      [
        '7.1.6',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-flow-strip-types-7.1.6-4b7be62604d39e63cfe23b1d00d63e9fb7e763ba/node_modules/@babel/plugin-transform-flow-strip-types/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-flow', '7.0.0'],
            ['@babel/plugin-transform-flow-strip-types', '7.1.6']
          ])
        }
      ]
    ])
  ],
  [
    '@babel/plugin-syntax-flow',
    new Map([
      [
        '7.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-syntax-flow-7.0.0-70638aeaad9ee426bc532e51523cff8ff02f6f17/node_modules/@babel/plugin-syntax-flow/'
          ),
          packageDependencies: new Map([
            ['@babel/core', '7.1.6'],
            ['@babel/helper-plugin-utils', '7.0.0'],
            ['@babel/plugin-syntax-flow', '7.0.0']
          ])
        }
      ]
    ])
  ],
  [
    'jest-pnp-resolver',
    new Map([
      [
        '1.0.2',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-jest-pnp-resolver-1.0.2-470384ae9ea31f72136db52618aa4010ff23b715/node_modules/jest-pnp-resolver/'
          ),
          packageDependencies: new Map([['jest-pnp-resolver', '1.0.2']])
        }
      ]
    ])
  ],
  [
    'nice-try',
    new Map([
      [
        '1.0.5',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/'
          ),
          packageDependencies: new Map([['nice-try', '1.0.5']])
        }
      ]
    ])
  ],
  [
    'pump',
    new Map([
      [
        '3.0.0',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-pump-3.0.0-b4a2116815bde2f4e1ea602354e8c75565107a64/node_modules/pump/'
          ),
          packageDependencies: new Map([['end-of-stream', '1.4.1'], ['once', '1.4.0'], ['pump', '3.0.0']])
        }
      ]
    ])
  ],
  [
    'end-of-stream',
    new Map([
      [
        '1.4.1',
        {
          packageLocation: path.resolve(
            __dirname,
            '../../../home/aram/.cache/yarn/v4/npm-end-of-stream-1.4.1-ed29634d19baba463b6ce6b80a37213eab71ec43/node_modules/end-of-stream/'
          ),
          packageDependencies: new Map([['once', '1.4.0'], ['end-of-stream', '1.4.1']])
        }
      ]
    ])
  ],
  [
    null,
    new Map([
      [
        null,
        {
          packageLocation: path.resolve(__dirname, './'),
          packageDependencies: new Map([
            ['babel-jest', 'pnp:763735a22481aea702b7b991000ae4ff3edf6e9b'],
            ['jest-cli', '23.0.0'],
            ['babel-core', '7.0.0-bridge.0'],
            ['@babel/core', '7.1.6'],
            ['@babel/preset-env', '7.1.6'],
            ['@babel/preset-flow', '7.0.0'],
            ['jest-pnp-resolver', '1.0.2'],
            ['jest-environment-jsdom', '23.4.0'],
            ['execa', '1.0.0']
          ])
        }
      ]
    ])
  ]
]);

let locatorsByLocations = new Map([
  ['./.pnp/externals/pnp-763735a22481aea702b7b991000ae4ff3edf6e9b/node_modules/babel-jest/', blacklistedLocator],
  ['./.pnp/externals/pnp-c4ef49fe71ca03400d1cf69604c420f6d409b4d1/node_modules/babel-jest/', blacklistedLocator],
  [
    './.pnp/externals/pnp-2fcc5c9b6d95aef842f0ddcf8012983018578bda/node_modules/@babel/plugin-syntax-async-generators/',
    blacklistedLocator
  ],
  [
    './.pnp/externals/pnp-c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e/node_modules/@babel/plugin-syntax-object-rest-spread/',
    blacklistedLocator
  ],
  [
    './.pnp/externals/pnp-d8fabc0f71e09f7047d8576625a0959fc0684dcd/node_modules/@babel/plugin-syntax-optional-catch-binding/',
    blacklistedLocator
  ],
  [
    './.pnp/externals/pnp-700ef535efb74f629e1d4179b7c087ca71598812/node_modules/@babel/plugin-syntax-async-generators/',
    blacklistedLocator
  ],
  [
    './.pnp/externals/pnp-1bf85085bb7bcebf7ec5585626babe5a0a899875/node_modules/@babel/plugin-syntax-object-rest-spread/',
    blacklistedLocator
  ],
  [
    './.pnp/externals/pnp-e41313624e174e2a0226f94e9c37d10479b9c671/node_modules/@babel/plugin-syntax-optional-catch-binding/',
    blacklistedLocator
  ],
  [
    './.pnp/externals/pnp-763735a22481aea702b7b991000ae4ff3edf6e9b/node_modules/babel-jest/',
    { name: 'babel-jest', reference: 'pnp:763735a22481aea702b7b991000ae4ff3edf6e9b' }
  ],
  [
    './.pnp/externals/pnp-c4ef49fe71ca03400d1cf69604c420f6d409b4d1/node_modules/babel-jest/',
    { name: 'babel-jest', reference: 'pnp:c4ef49fe71ca03400d1cf69604c420f6d409b4d1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-plugin-istanbul-4.1.6-36c59b2192efce81c5b378321b74175add1c9a45/node_modules/babel-plugin-istanbul/',
    { name: 'babel-plugin-istanbul', reference: '4.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-plugin-syntax-object-rest-spread-6.13.0-fd6536f2bce13836ffa3a5458c4903a597bb3bf5/node_modules/babel-plugin-syntax-object-rest-spread/',
    { name: 'babel-plugin-syntax-object-rest-spread', reference: '6.13.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-find-up-2.1.0-45d1b7e506c717ddd482775a2b77920a3c0c57a7/node_modules/find-up/',
    { name: 'find-up', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-find-up-1.1.2-6b2e9822b1a2ce0a60ab64d610eccad53cb24d0f/node_modules/find-up/',
    { name: 'find-up', reference: '1.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-locate-path-2.0.0-2b568b265eec944c6d9c0de9c3dbbbca0354cd8e/node_modules/locate-path/',
    { name: 'locate-path', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-p-locate-2.0.0-20a0103b222a70c8fd39cc2e580680f3dde5ec43/node_modules/p-locate/',
    { name: 'p-locate', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-p-limit-1.3.0-b86bd5f0c25690911c7590fcbfc2010d54b3ccb8/node_modules/p-limit/',
    { name: 'p-limit', reference: '1.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-p-try-1.0.0-cbc79cdbaf8fd4228e13f621f2b1a237c1b207b3/node_modules/p-try/',
    { name: 'p-try', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/',
    { name: 'path-exists', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-path-exists-2.1.0-0feb6c64f0fc518d9a754dd5efb62c7022761f4b/node_modules/path-exists/',
    { name: 'path-exists', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-instrument-1.10.2-1f55ed10ac3c47f2bdddd5307935126754d0a9ca/node_modules/istanbul-lib-instrument/',
    { name: 'istanbul-lib-instrument', reference: '1.10.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-generator-6.26.1-1844408d3b8f0d35a404ea7ac180f087a601bd90/node_modules/babel-generator/',
    { name: 'babel-generator', reference: '6.26.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-messages-6.23.0-f3cdf4703858035b2a2951c6ec5edf6c62f2630e/node_modules/babel-messages/',
    { name: 'babel-messages', reference: '6.23.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-runtime-6.26.0-965c7058668e82b55d7bfe04ff2337bc8b5647fe/node_modules/babel-runtime/',
    { name: 'babel-runtime', reference: '6.26.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-core-js-2.5.7-f972608ff0cead68b841a16a932d0b183791814e/node_modules/core-js/',
    { name: 'core-js', reference: '2.5.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regenerator-runtime-0.11.1-be05ad7f9bf7d22e056f9726cee5017fbf19e2e9/node_modules/regenerator-runtime/',
    { name: 'regenerator-runtime', reference: '0.11.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-types-6.26.0-a3b073f94ab49eb6fa55cd65227a334380632497/node_modules/babel-types/',
    { name: 'babel-types', reference: '6.26.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-esutils-2.0.2-0abf4f1caa5bcb1f7a9d8acc6dea4faaa04bac9b/node_modules/esutils/',
    { name: 'esutils', reference: '2.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/',
    { name: 'lodash', reference: '4.17.11' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-to-fast-properties-1.0.3-b83571fa4d8c25b82e231b06e3a3055de4ca1a47/node_modules/to-fast-properties/',
    { name: 'to-fast-properties', reference: '1.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-to-fast-properties-2.0.0-dc5e698cbd079265bc73e0377681a4e4e83f616e/node_modules/to-fast-properties/',
    { name: 'to-fast-properties', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-detect-indent-4.0.0-f76d064352cdf43a1cb6ce619c4ee3a9475de208/node_modules/detect-indent/',
    { name: 'detect-indent', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-repeating-2.0.1-5214c53a926d3552707527fbab415dbc08d06dda/node_modules/repeating/',
    { name: 'repeating', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-finite-1.0.2-cc6677695602be550ef11e8b4aa6305342b6d0aa/node_modules/is-finite/',
    { name: 'is-finite', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/',
    { name: 'number-is-nan', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jsesc-1.3.0-46c3fec8c1892b12b0833db9bc7622176dbab34b/node_modules/jsesc/',
    { name: 'jsesc', reference: '1.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jsesc-2.5.2-80564d2e483dacf6e8ef209650a67df3f0c283a4/node_modules/jsesc/',
    { name: 'jsesc', reference: '2.5.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jsesc-0.5.0-e7dee66e35d6fc16f710fe91d5cf69f70f08911d/node_modules/jsesc/',
    { name: 'jsesc', reference: '0.5.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/',
    { name: 'source-map', reference: '0.5.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-source-map-0.6.1-74722af32e9614e9c287a8d0bbde48b5e2f1a263/node_modules/source-map/',
    { name: 'source-map', reference: '0.6.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-trim-right-1.0.1-cb2e1203067e0c8de1f614094b9fe45704ea6003/node_modules/trim-right/',
    { name: 'trim-right', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-template-6.26.0-de03e2d16396b069f46dd9fff8521fb1a0e35e02/node_modules/babel-template/',
    { name: 'babel-template', reference: '6.26.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-traverse-6.26.0-46a9cbd7edcc62c8e5c064e2d2d8d0f4035766ee/node_modules/babel-traverse/',
    { name: 'babel-traverse', reference: '6.26.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-code-frame-6.26.0-63fd43f7dc1e3bb7ce35947db8fe369a3f58c74b/node_modules/babel-code-frame/',
    { name: 'babel-code-frame', reference: '6.26.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-chalk-1.1.3-a8115c55e4a702fe4d150abd3872822a7e09fc98/node_modules/chalk/',
    { name: 'chalk', reference: '1.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-chalk-2.4.1-18c49ab16a037b6eb0152cc83e3471338215b66e/node_modules/chalk/',
    { name: 'chalk', reference: '2.4.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ansi-styles-2.2.1-b432dd3358b634cf75e1e4664368240533c1ddbe/node_modules/ansi-styles/',
    { name: 'ansi-styles', reference: '2.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/',
    { name: 'ansi-styles', reference: '3.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/',
    { name: 'escape-string-regexp', reference: '1.0.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-ansi-2.0.0-34f5049ce1ecdf2b0649af3ef24e45ed35416d91/node_modules/has-ansi/',
    { name: 'has-ansi', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/',
    { name: 'ansi-regex', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/',
    { name: 'ansi-regex', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/',
    { name: 'strip-ansi', reference: '3.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/',
    { name: 'strip-ansi', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-supports-color-2.0.0-535d045ce6b6363fa40117084629995e9df324c7/node_modules/supports-color/',
    { name: 'supports-color', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/',
    { name: 'supports-color', reference: '5.5.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-supports-color-3.2.3-65ac0504b3954171d8a64946b2ae3cbb8a5f54f6/node_modules/supports-color/',
    { name: 'supports-color', reference: '3.2.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-js-tokens-3.0.2-9866df395102130e38f7f996bceb65443209c25b/node_modules/js-tokens/',
    { name: 'js-tokens', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/',
    { name: 'js-tokens', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babylon-6.18.0-af2f3b88fa6f5c1e4c634d1a0f8eac4f55b395e3/node_modules/babylon/',
    { name: 'babylon', reference: '6.18.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/',
    { name: 'debug', reference: '2.6.9' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-debug-3.2.6-e83d17de16d8a7efb7717edbe5fb10135eee629b/node_modules/debug/',
    { name: 'debug', reference: '3.2.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-debug-4.1.0-373687bffa678b38b1cd91f861b63850035ddc87/node_modules/debug/',
    { name: 'debug', reference: '4.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/',
    { name: 'ms', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ms-2.1.1-30a5864eb3ebb0a66f2ebe6d727af06a09d86e0a/node_modules/ms/',
    { name: 'ms', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-globals-9.18.0-aa3896b3e69b487f17e31ed2143d69a8e30c2d8a/node_modules/globals/',
    { name: 'globals', reference: '9.18.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-globals-11.9.0-bde236808e987f290768a93d065060d78e6ab249/node_modules/globals/',
    { name: 'globals', reference: '11.9.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-invariant-2.2.4-610f3c92c9359ce1db616e538008d23ff35158e6/node_modules/invariant/',
    { name: 'invariant', reference: '2.2.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-loose-envify-1.4.0-71ee51fa7be4caec1a63839f7e682d8132d30caf/node_modules/loose-envify/',
    { name: 'loose-envify', reference: '1.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-coverage-1.2.1-ccf7edcd0a0bb9b8f729feeb0930470f9af664f0/node_modules/istanbul-lib-coverage/',
    { name: 'istanbul-lib-coverage', reference: '1.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-semver-5.6.0-7e74256fbaa49c75aa7c7a205cc22799cac80004/node_modules/semver/',
    { name: 'semver', reference: '5.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-test-exclude-4.2.3-a9a5e64474e4398339245a0a769ad7c2f4a97c20/node_modules/test-exclude/',
    { name: 'test-exclude', reference: '4.2.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-arrify-1.0.1-898508da2226f380df904728456849c1501a4b0d/node_modules/arrify/',
    { name: 'arrify', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-micromatch-2.3.11-86677c97d1720b363431d04d0d15293bd38c1565/node_modules/micromatch/',
    { name: 'micromatch', reference: '2.3.11' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/',
    { name: 'micromatch', reference: '3.1.10' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-arr-diff-2.0.0-8f3b827f955a8bd669697e4a4256ac3ceae356cf/node_modules/arr-diff/',
    { name: 'arr-diff', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/',
    { name: 'arr-diff', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/',
    { name: 'arr-flatten', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-array-unique-0.2.1-a1d97ccafcbc2625cc70fadceb36a50c58b01a53/node_modules/array-unique/',
    { name: 'array-unique', reference: '0.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/',
    { name: 'array-unique', reference: '0.3.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-braces-1.8.5-ba77962e12dff969d6b76711e914b737857bf6a7/node_modules/braces/',
    { name: 'braces', reference: '1.8.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/',
    { name: 'braces', reference: '2.3.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-expand-range-1.8.2-a299effd335fe2721ebae8e257ec79644fc85337/node_modules/expand-range/',
    { name: 'expand-range', reference: '1.8.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fill-range-2.2.4-eb1e773abb056dcd8df2bfdf6af59b8b3a936565/node_modules/fill-range/',
    { name: 'fill-range', reference: '2.2.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/',
    { name: 'fill-range', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-number-2.1.0-01fcbbb393463a548f2f466cce16dece49db908f/node_modules/is-number/',
    { name: 'is-number', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-number-4.0.0-0026e37f5454d73e356dfe6564699867c6a7f0ff/node_modules/is-number/',
    { name: 'is-number', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/',
    { name: 'is-number', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/',
    { name: 'kind-of', reference: '3.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/',
    { name: 'kind-of', reference: '6.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/',
    { name: 'kind-of', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/',
    { name: 'kind-of', reference: '5.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/',
    { name: 'is-buffer', reference: '1.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/',
    { name: 'isobject', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/',
    { name: 'isobject', reference: '3.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/',
    { name: 'isarray', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-randomatic-3.1.1-b776efc59375984e36c537b2f51a1f0aff0da1ed/node_modules/randomatic/',
    { name: 'randomatic', reference: '3.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-math-random-1.0.1-8b3aac588b8a66e4975e3cdea67f7bb329601fac/node_modules/math-random/',
    { name: 'math-random', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/',
    { name: 'repeat-element', reference: '1.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/',
    { name: 'repeat-string', reference: '1.6.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-preserve-0.2.0-815ed1f6ebc65926f865b310c0713bcb3315ce4b/node_modules/preserve/',
    { name: 'preserve', reference: '0.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-expand-brackets-0.1.5-df07284e342a807cd733ac5af72411e581d1177b/node_modules/expand-brackets/',
    { name: 'expand-brackets', reference: '0.1.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/',
    { name: 'expand-brackets', reference: '2.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-posix-bracket-0.1.1-3334dc79774368e92f016e6fbc0a88f5cd6e6bc4/node_modules/is-posix-bracket/',
    { name: 'is-posix-bracket', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extglob-0.3.2-2e18ff3d2f49ab2765cec9023f011daa8d8349a1/node_modules/extglob/',
    { name: 'extglob', reference: '0.3.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/',
    { name: 'extglob', reference: '2.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-extglob-1.0.0-ac468177c4943405a092fc8f29760c6ffc6206c0/node_modules/is-extglob/',
    { name: 'is-extglob', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-filename-regex-2.0.1-c1c4b9bee3e09725ddb106b75c1e301fe2f18b26/node_modules/filename-regex/',
    { name: 'filename-regex', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-glob-2.0.1-d096f926a3ded5600f3fdfd91198cb0888c2d863/node_modules/is-glob/',
    { name: 'is-glob', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/',
    { name: 'normalize-path', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/',
    { name: 'remove-trailing-separator', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-omit-2.0.1-1a9c744829f39dbb858c76ca3579ae2a54ebd1fa/node_modules/object.omit/',
    { name: 'object.omit', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-for-own-0.1.5-5265c681a4f294dabbf17c9509b6763aa84510ce/node_modules/for-own/',
    { name: 'for-own', reference: '0.1.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/',
    { name: 'for-in', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/',
    { name: 'is-extendable', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/',
    { name: 'is-extendable', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-parse-glob-3.0.4-b2c376cfb11f35513badd173ef0bb6e3a388391c/node_modules/parse-glob/',
    { name: 'parse-glob', reference: '3.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-glob-base-0.3.0-dbb164f6221b1c0b1ccf82aea328b497df0ea3c4/node_modules/glob-base/',
    { name: 'glob-base', reference: '0.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-glob-parent-2.0.0-81383d72db054fcccf5336daa902f182f6edbb28/node_modules/glob-parent/',
    { name: 'glob-parent', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-dotfile-1.0.3-a6a2f32ffd2dfb04f5ca25ecd0f6b83cf798a1e1/node_modules/is-dotfile/',
    { name: 'is-dotfile', reference: '1.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regex-cache-0.4.4-75bdc58a2a1496cec48a12835bc54c8d562336dd/node_modules/regex-cache/',
    { name: 'regex-cache', reference: '0.4.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-equal-shallow-0.1.3-2238098fc221de0bcfa5d9eac4c45d638aa1c534/node_modules/is-equal-shallow/',
    { name: 'is-equal-shallow', reference: '0.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-primitive-2.0.0-207bab91638499c07b2adf240a41a87210034575/node_modules/is-primitive/',
    { name: 'is-primitive', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/',
    { name: 'object-assign', reference: '4.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-read-pkg-up-1.0.1-9d63c13276c065918d57f002a57f40a1b643fb02/node_modules/read-pkg-up/',
    { name: 'read-pkg-up', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pinkie-promise-2.0.1-2135d6dfa7a358c069ac9b178776288228450ffa/node_modules/pinkie-promise/',
    { name: 'pinkie-promise', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pinkie-2.0.4-72556b80cfa0d48a974e80e77248e80ed4f7f870/node_modules/pinkie/',
    { name: 'pinkie', reference: '2.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-read-pkg-1.1.0-f5ffaa5ecd29cb31c0474bca7d756b6bb29e3f28/node_modules/read-pkg/',
    { name: 'read-pkg', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-load-json-file-1.1.0-956905708d58b4bab4c2261b04f59f31c99374c0/node_modules/load-json-file/',
    { name: 'load-json-file', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-graceful-fs-4.1.15-ffb703e1066e8a0eeaa4c8b80ba9253eeefbfb00/node_modules/graceful-fs/',
    { name: 'graceful-fs', reference: '4.1.15' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-parse-json-2.2.0-f480f40434ef80741f8469099f8dea18f55a4dc9/node_modules/parse-json/',
    { name: 'parse-json', reference: '2.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-error-ex-1.3.2-b4ac40648107fdcdcfae242f428bea8a14d4f1bf/node_modules/error-ex/',
    { name: 'error-ex', reference: '1.3.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-arrayish-0.2.1-77c99840527aa8ecb1a8ba697b80645a7a926a9d/node_modules/is-arrayish/',
    { name: 'is-arrayish', reference: '0.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pify-2.3.0-ed141a6ac043a849ea588498e7dca8b15330e90c/node_modules/pify/',
    { name: 'pify', reference: '2.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-strip-bom-2.0.0-6219a85616520491f35788bdbf1447a99c7e6b0e/node_modules/strip-bom/',
    { name: 'strip-bom', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-strip-bom-3.0.0-2334c18e9c759f7bdd56fdef7e9ae3d588e68ed3/node_modules/strip-bom/',
    { name: 'strip-bom', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-utf8-0.2.1-4b0da1442104d1b336340e80797e865cf39f7d72/node_modules/is-utf8/',
    { name: 'is-utf8', reference: '0.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-normalize-package-data-2.4.0-12f95a307d58352075a04907b84ac8be98ac012f/node_modules/normalize-package-data/',
    { name: 'normalize-package-data', reference: '2.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-hosted-git-info-2.7.1-97f236977bd6e125408930ff6de3eec6281ec047/node_modules/hosted-git-info/',
    { name: 'hosted-git-info', reference: '2.7.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-builtin-module-1.0.0-540572d34f7ac3119f8f76c30cbc1b1e037affbe/node_modules/is-builtin-module/',
    { name: 'is-builtin-module', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-builtin-modules-1.1.1-270f076c5a72c02f5b65a47df94c5fe3a278892f/node_modules/builtin-modules/',
    { name: 'builtin-modules', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-validate-npm-package-license-3.0.4-fc91f6b9c7ba15c857f4cb2c5defeec39d4f410a/node_modules/validate-npm-package-license/',
    { name: 'validate-npm-package-license', reference: '3.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-spdx-correct-3.0.2-19bb409e91b47b1ad54159243f7312a858db3c2e/node_modules/spdx-correct/',
    { name: 'spdx-correct', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-spdx-expression-parse-3.0.0-99e119b7a5da00e05491c9fa338b7904823b41d0/node_modules/spdx-expression-parse/',
    { name: 'spdx-expression-parse', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-spdx-exceptions-2.2.0-2ea450aee74f2a89bfb94519c07fcd6f41322977/node_modules/spdx-exceptions/',
    { name: 'spdx-exceptions', reference: '2.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-spdx-license-ids-3.0.2-a59efc09784c2a5bada13cfeaf5c75dd214044d2/node_modules/spdx-license-ids/',
    { name: 'spdx-license-ids', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-path-type-1.1.0-59c44f7ee491da704da415da5a4070ba4f8fe441/node_modules/path-type/',
    { name: 'path-type', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-require-main-filename-1.0.1-97f717b69d48784f5f526a6c5aa8ffdda055a4d1/node_modules/require-main-filename/',
    { name: 'require-main-filename', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-preset-jest-23.2.0-8ec7a03a138f001a1a8fb1e8113652bf1a55da46/node_modules/babel-preset-jest/',
    { name: 'babel-preset-jest', reference: '23.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-plugin-jest-hoist-23.2.0-e61fae05a1ca8801aadee57a6d66b8cefaf44167/node_modules/babel-plugin-jest-hoist/',
    { name: 'babel-plugin-jest-hoist', reference: '23.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-cli-23.0.0-29287498c9d844dcda5aaf011a4c82f9a888836e/node_modules/jest-cli/',
    { name: 'jest-cli', reference: '23.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ansi-escapes-3.1.0-f73207bb81207d75fd6c83f125af26eea378ca30/node_modules/ansi-escapes/',
    { name: 'ansi-escapes', reference: '3.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/',
    { name: 'color-convert', reference: '1.9.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/',
    { name: 'color-name', reference: '1.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/',
    { name: 'has-flag', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-flag-1.0.0-9d9e793165ce017a00f00418c43f942a7b1d11fa/node_modules/has-flag/',
    { name: 'has-flag', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-exit-0.1.2-0632638f8d877cc82107d30a0fff1a17cba1cd0c/node_modules/exit/',
    { name: 'exit', reference: '0.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-glob-7.1.3-3960832d3f1574108342dafd3a67b332c0969df1/node_modules/glob/',
    { name: 'glob', reference: '7.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/',
    { name: 'fs.realpath', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/',
    { name: 'inflight', reference: '1.0.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/',
    { name: 'once', reference: '1.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/',
    { name: 'wrappy', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/',
    { name: 'inherits', reference: '2.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/',
    { name: 'minimatch', reference: '3.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/',
    { name: 'brace-expansion', reference: '1.1.11' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/',
    { name: 'balanced-match', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/',
    { name: 'concat-map', reference: '0.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/',
    { name: 'path-is-absolute', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-import-local-1.0.0-5e4ffdc03f4fe6c009c6729beb29631c2f8227bc/node_modules/import-local/',
    { name: 'import-local', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pkg-dir-2.0.0-f6d5d1109e19d63edf428e0bd57e12777615334b/node_modules/pkg-dir/',
    { name: 'pkg-dir', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-resolve-cwd-2.0.0-00a9f7387556e27038eae232caa372a6a59b665a/node_modules/resolve-cwd/',
    { name: 'resolve-cwd', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-resolve-from-3.0.0-b22c7af7d9d6881bc8b6e653335eebcb0a188748/node_modules/resolve-from/',
    { name: 'resolve-from', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-ci-1.2.1-e3779c8ee17fccf428488f6e281187f2e632841c/node_modules/is-ci/',
    { name: 'is-ci', reference: '1.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ci-info-1.6.0-2ca20dbb9ceb32d4524a683303313f0304b1e497/node_modules/ci-info/',
    { name: 'ci-info', reference: '1.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-api-1.3.7-a86c770d2b03e11e3f778cd7aedd82d2722092aa/node_modules/istanbul-api/',
    { name: 'istanbul-api', reference: '1.3.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-async-2.6.1-b245a23ca71930044ec53fa46aa00a3e87c6a610/node_modules/async/',
    { name: 'async', reference: '2.6.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fileset-2.0.3-8e7548a96d3cc2327ee5e674168723a333bba2a0/node_modules/fileset/',
    { name: 'fileset', reference: '2.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-hook-1.2.2-bc6bf07f12a641fbf1c85391d0daa8f0aea6bf86/node_modules/istanbul-lib-hook/',
    { name: 'istanbul-lib-hook', reference: '1.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-append-transform-0.4.0-d76ebf8ca94d276e247a36bad44a4b74ab611991/node_modules/append-transform/',
    { name: 'append-transform', reference: '0.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-default-require-extensions-1.0.0-f37ea15d3e13ffd9b437d33e1a75b5fb97874cb8/node_modules/default-require-extensions/',
    { name: 'default-require-extensions', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-report-1.1.5-f2a657fc6282f96170aaf281eb30a458f7f4170c/node_modules/istanbul-lib-report/',
    { name: 'istanbul-lib-report', reference: '1.1.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/',
    { name: 'mkdirp', reference: '0.5.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/',
    { name: 'minimist', reference: '0.0.8' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-minimist-0.0.10-de3f98543dbf96082be48ad1a0c7cda836301dcf/node_modules/minimist/',
    { name: 'minimist', reference: '0.0.10' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/',
    { name: 'minimist', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/',
    { name: 'path-parse', reference: '1.0.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-lib-source-maps-1.2.6-37b9ff661580f8fca11232752ee42e08c6675d8f/node_modules/istanbul-lib-source-maps/',
    { name: 'istanbul-lib-source-maps', reference: '1.2.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-rimraf-2.6.2-2ed8150d24a16ea8651e6d6ef0f47c4158ce7a36/node_modules/rimraf/',
    { name: 'rimraf', reference: '2.6.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-istanbul-reports-1.5.1-97e4dbf3b515e8c484caea15d6524eebd3ff4e1a/node_modules/istanbul-reports/',
    { name: 'istanbul-reports', reference: '1.5.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-handlebars-4.0.12-2c15c8a96d46da5e266700518ba8cb8d919d5bc5/node_modules/handlebars/',
    { name: 'handlebars', reference: '4.0.12' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-optimist-0.6.1-da3ea74686fa21a19a111c326e90eb15a0196686/node_modules/optimist/',
    { name: 'optimist', reference: '0.6.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-wordwrap-0.0.3-a3d5da6cd5c0bc0008d37234bbaf1bed63059107/node_modules/wordwrap/',
    { name: 'wordwrap', reference: '0.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-wordwrap-1.0.0-27584810891456a4171c8d0226441ade90cbcaeb/node_modules/wordwrap/',
    { name: 'wordwrap', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-uglify-js-3.4.9-af02f180c1207d76432e473ed24a28f4a782bae3/node_modules/uglify-js/',
    { name: 'uglify-js', reference: '3.4.9' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-commander-2.17.1-bd77ab7de6de94205ceacc72f1716d29f20a77bf/node_modules/commander/',
    { name: 'commander', reference: '2.17.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-js-yaml-3.12.0-eaed656ec8344f10f527c6bfa1b6e2244de167d1/node_modules/js-yaml/',
    { name: 'js-yaml', reference: '3.12.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911/node_modules/argparse/',
    { name: 'argparse', reference: '1.0.10' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c/node_modules/sprintf-js/',
    { name: 'sprintf-js', reference: '1.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71/node_modules/esprima/',
    { name: 'esprima', reference: '4.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-esprima-3.1.3-fdca51cee6133895e3c88d535ce49dbff62a4633/node_modules/esprima/',
    { name: 'esprima', reference: '3.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-changed-files-22.4.3-8882181e022c38bd46a2e4d18d44d19d90a90fb2/node_modules/jest-changed-files/',
    { name: 'jest-changed-files', reference: '22.4.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-throat-4.1.0-89037cbc92c56ab18926e6ba4cbb200e15672a6a/node_modules/throat/',
    { name: 'throat', reference: '4.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-config-23.6.0-f82546a90ade2d8c7026fbf6ac5207fc22f8eb1d/node_modules/jest-config/',
    { name: 'jest-config', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-core-6.26.3-b2e2f09e342d0f0c88e2f02e067794125e75c207/node_modules/babel-core/',
    { name: 'babel-core', reference: '6.26.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-core-7.0.0-bridge.0-95a492ddd90f9b4e9a4a1da14eb335b87b634ece/node_modules/babel-core/',
    { name: 'babel-core', reference: '7.0.0-bridge.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-helpers-6.24.1-3471de9caec388e5c850e597e58a26ddf37602b2/node_modules/babel-helpers/',
    { name: 'babel-helpers', reference: '6.24.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-babel-register-6.26.0-6ed021173e2fcb486d7acb45c6009a856f647071/node_modules/babel-register/',
    { name: 'babel-register', reference: '6.26.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-home-or-tmp-2.0.0-e36c3f2d2cae7d746a857e38d18d5f32a7882db8/node_modules/home-or-tmp/',
    { name: 'home-or-tmp', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/',
    { name: 'os-homedir', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/',
    { name: 'os-tmpdir', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-source-map-support-0.4.18-0286a6de8be42641338594e97ccea75f0a2c585f/node_modules/source-map-support/',
    { name: 'source-map-support', reference: '0.4.18' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-source-map-support-0.5.9-41bc953b2534267ea2d605bccfa7bfa3111ced5f/node_modules/source-map-support/',
    { name: 'source-map-support', reference: '0.5.9' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-convert-source-map-1.6.0-51b537a8c43e0f04dec1993bffcdd504e758ac20/node_modules/convert-source-map/',
    { name: 'convert-source-map', reference: '1.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/',
    { name: 'safe-buffer', reference: '5.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-json5-0.5.1-1eade7acc012034ad84e2396767ead9fa5495821/node_modules/json5/',
    { name: 'json5', reference: '0.5.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-json5-2.1.0-e7a0c62c48285c628d20a10b85c89bb807c32850/node_modules/json5/',
    { name: 'json5', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-private-0.1.8-2381edb3689f7a53d653190060fcf822d2f368ff/node_modules/private/',
    { name: 'private', reference: '0.1.8' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-slash-1.0.0-c41f2f6c39fc16d1cd17ad4b5d896114ae470d55/node_modules/slash/',
    { name: 'slash', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-environment-jsdom-23.4.0-056a7952b3fea513ac62a140a2c368c79d9e6023/node_modules/jest-environment-jsdom/',
    { name: 'jest-environment-jsdom', reference: '23.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-mock-23.2.0-ad1c60f29e8719d47c26e1138098b6d18b261134/node_modules/jest-mock/',
    { name: 'jest-mock', reference: '23.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-util-23.4.0-4d063cb927baf0a23831ff61bec2cbbf49793561/node_modules/jest-util/',
    { name: 'jest-util', reference: '23.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-callsites-2.0.0-06eb84f00eea413da86affefacbffb36093b3c50/node_modules/callsites/',
    { name: 'callsites', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-message-util-23.4.0-17610c50942349508d01a3d1e0bda2c079086a9f/node_modules/jest-message-util/',
    { name: 'jest-message-util', reference: '23.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-code-frame-7.0.0-06e2ab19bdb535385559aabb5ba59729482800f8/node_modules/@babel/code-frame/',
    { name: '@babel/code-frame', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-highlight-7.0.0-f710c38c8d458e6dd9a201afb637fcb781ce99e4/node_modules/@babel/highlight/',
    { name: '@babel/highlight', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-stack-utils-1.0.2-33eba3897788558bebfc2db059dc158ec36cebb8/node_modules/stack-utils/',
    { name: 'stack-utils', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jsdom-11.12.0-1a80d40ddd378a1de59656e9e6dc5a3ba8657bc8/node_modules/jsdom/',
    { name: 'jsdom', reference: '11.12.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-abab-2.0.0-aba0ab4c5eee2d4c79d3487d85450fb2376ebb0f/node_modules/abab/',
    { name: 'abab', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-acorn-5.7.3-67aa231bf8812974b85235a96771eb6bd07ea279/node_modules/acorn/',
    { name: 'acorn', reference: '5.7.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-acorn-6.0.4-77377e7353b72ec5104550aa2d2097a2fd40b754/node_modules/acorn/',
    { name: 'acorn', reference: '6.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-acorn-globals-4.3.0-e3b6f8da3c1552a95ae627571f7dd6923bb54103/node_modules/acorn-globals/',
    { name: 'acorn-globals', reference: '4.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-acorn-walk-6.1.1-d363b66f5fac5f018ff9c3a1e7b6f8e310cc3913/node_modules/acorn-walk/',
    { name: 'acorn-walk', reference: '6.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-array-equal-1.0.0-8c2a5ef2472fd9ea742b04c77a75093ba2757c93/node_modules/array-equal/',
    { name: 'array-equal', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-cssom-0.3.4-8cd52e8a3acfd68d3aed38ee0a640177d2f9d797/node_modules/cssom/',
    { name: 'cssom', reference: '0.3.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-cssstyle-1.1.1-18b038a9c44d65f7a8e428a653b9f6fe42faf5fb/node_modules/cssstyle/',
    { name: 'cssstyle', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-data-urls-1.1.0-15ee0582baa5e22bb59c77140da8f9c76963bbfe/node_modules/data-urls/',
    { name: 'data-urls', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-whatwg-mimetype-2.3.0-3d4b1e0312d2079879f826aff18dbeeca5960fbf/node_modules/whatwg-mimetype/',
    { name: 'whatwg-mimetype', reference: '2.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-whatwg-url-7.0.0-fde926fa54a599f3adf82dff25a9f7be02dc6edd/node_modules/whatwg-url/',
    { name: 'whatwg-url', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-whatwg-url-6.5.0-f2df02bff176fd65070df74ad5ccbb5a199965a8/node_modules/whatwg-url/',
    { name: 'whatwg-url', reference: '6.5.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-lodash-sortby-4.7.0-edd14c824e2cc9c1e0b0a1b42bb5210516a42438/node_modules/lodash.sortby/',
    { name: 'lodash.sortby', reference: '4.7.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-tr46-1.0.1-a8b13fd6bfd2489519674ccde55ba3693b706d09/node_modules/tr46/',
    { name: 'tr46', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/',
    { name: 'punycode', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-punycode-1.4.1-c0d5a63b2718800ad8e1eb0fa5269c84dd41845e/node_modules/punycode/',
    { name: 'punycode', reference: '1.4.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-webidl-conversions-4.0.2-a855980b1f0b6b359ba1d5d9fb39ae941faa63ad/node_modules/webidl-conversions/',
    { name: 'webidl-conversions', reference: '4.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-domexception-1.0.1-937442644ca6a31261ef36e3ec677fe805582c90/node_modules/domexception/',
    { name: 'domexception', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-escodegen-1.11.0-b27a9389481d5bfd5bec76f7bb1eb3f8f4556589/node_modules/escodegen/',
    { name: 'escodegen', reference: '1.11.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-estraverse-4.2.0-0dee3fed31fcd469618ce7342099fc1afa0bdb13/node_modules/estraverse/',
    { name: 'estraverse', reference: '4.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-optionator-0.8.2-364c5e409d3f4d6301d6c0b4c05bba50180aeb64/node_modules/optionator/',
    { name: 'optionator', reference: '0.8.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/',
    { name: 'deep-is', reference: '0.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917/node_modules/fast-levenshtein/',
    { name: 'fast-levenshtein', reference: '2.0.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee/node_modules/levn/',
    { name: 'levn', reference: '0.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54/node_modules/prelude-ls/',
    { name: 'prelude-ls', reference: '1.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72/node_modules/type-check/',
    { name: 'type-check', reference: '0.3.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-html-encoding-sniffer-1.0.2-e70d84b94da53aa375e11fe3a351be6642ca46f8/node_modules/html-encoding-sniffer/',
    { name: 'html-encoding-sniffer', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-whatwg-encoding-1.0.5-5abacf777c32166a51d085d6b4f3e7d27113ddb0/node_modules/whatwg-encoding/',
    { name: 'whatwg-encoding', reference: '1.0.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/',
    { name: 'iconv-lite', reference: '0.4.24' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/',
    { name: 'safer-buffer', reference: '2.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-left-pad-1.3.0-5b8a3a7765dfe001261dde915589e782f8c94d1e/node_modules/left-pad/',
    { name: 'left-pad', reference: '1.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-nwsapi-2.0.9-77ac0cdfdcad52b6a1151a84e73254edc33ed016/node_modules/nwsapi/',
    { name: 'nwsapi', reference: '2.0.9' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-parse5-4.0.0-6d78656e3da8d78b4ec0b906f7c08ef1dfe3f608/node_modules/parse5/',
    { name: 'parse5', reference: '4.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pn-1.1.0-e2f4cef0e219f463c179ab37463e4e1ecdccbafb/node_modules/pn/',
    { name: 'pn', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-request-2.88.0-9c2fca4f7d35b592efe57c7f0a55e81052124fef/node_modules/request/',
    { name: 'request', reference: '2.88.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-aws-sign2-0.7.0-b46e890934a9591f2d2f6f86d7e6a9f1b3fe76a8/node_modules/aws-sign2/',
    { name: 'aws-sign2', reference: '0.7.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-aws4-1.8.0-f0e003d9ca9e7f59c7a508945d7b2ef9a04a542f/node_modules/aws4/',
    { name: 'aws4', reference: '1.8.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-caseless-0.12.0-1b681c21ff84033c826543090689420d187151dc/node_modules/caseless/',
    { name: 'caseless', reference: '0.12.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-combined-stream-1.0.7-2d1d24317afb8abe95d6d2c0b07b57813539d828/node_modules/combined-stream/',
    { name: 'combined-stream', reference: '1.0.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-delayed-stream-1.0.0-df3ae199acadfb7d440aaae0b29e2272b24ec619/node_modules/delayed-stream/',
    { name: 'delayed-stream', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extend-3.0.2-f8b1136b4071fbd8eb140aff858b1019ec2915fa/node_modules/extend/',
    { name: 'extend', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-forever-agent-0.6.1-fbc71f0c41adeb37f96c577ad1ed42d8fdacca91/node_modules/forever-agent/',
    { name: 'forever-agent', reference: '0.6.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-form-data-2.3.3-dcce52c05f644f298c6a7ab936bd724ceffbf3a6/node_modules/form-data/',
    { name: 'form-data', reference: '2.3.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-asynckit-0.4.0-c79ed97f7f34cb8f2ba1bc9790bcc366474b4b79/node_modules/asynckit/',
    { name: 'asynckit', reference: '0.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-mime-types-2.1.21-28995aa1ecb770742fe6ae7e58f9181c744b3f96/node_modules/mime-types/',
    { name: 'mime-types', reference: '2.1.21' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-mime-db-1.37.0-0b6a0ce6fdbe9576e25f1f2d2fde8830dc0ad0d8/node_modules/mime-db/',
    { name: 'mime-db', reference: '1.37.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-har-validator-5.1.3-1ef89ebd3e4996557675eed9893110dc350fa080/node_modules/har-validator/',
    { name: 'har-validator', reference: '5.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ajv-6.6.1-6360f5ed0d80f232cc2b294c362d5dc2e538dd61/node_modules/ajv/',
    { name: 'ajv', reference: '6.6.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/',
    { name: 'fast-deep-equal', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/',
    { name: 'fast-json-stable-stringify', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/',
    { name: 'json-schema-traverse', reference: '0.4.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/',
    { name: 'uri-js', reference: '4.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-har-schema-2.0.0-a94c2224ebcac04782a0d9035521f24735b7ec92/node_modules/har-schema/',
    { name: 'har-schema', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-http-signature-1.2.0-9aecd925114772f3d95b65a60abb8f7c18fbace1/node_modules/http-signature/',
    { name: 'http-signature', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-assert-plus-1.0.0-f12e0f3c5d77b0b1cdd9146942e4e96c1e4dd525/node_modules/assert-plus/',
    { name: 'assert-plus', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jsprim-1.4.1-313e66bc1e5cc06e438bc1b7499c2e5c56acb6a2/node_modules/jsprim/',
    { name: 'jsprim', reference: '1.4.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extsprintf-1.3.0-96918440e3041a7a414f8c52e3c574eb3c3e1e05/node_modules/extsprintf/',
    { name: 'extsprintf', reference: '1.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extsprintf-1.4.0-e2689f8f356fad62cca65a3a91c5df5f9551692f/node_modules/extsprintf/',
    { name: 'extsprintf', reference: '1.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-json-schema-0.2.3-b480c892e59a2f05954ce727bd3f2a4e882f9e13/node_modules/json-schema/',
    { name: 'json-schema', reference: '0.2.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-verror-1.10.0-3a105ca17053af55d6e270c1f8288682e18da400/node_modules/verror/',
    { name: 'verror', reference: '1.10.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/',
    { name: 'core-util-is', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-sshpk-1.15.2-c946d6bd9b1a39d0e8635763f5242d6ed6dcb629/node_modules/sshpk/',
    { name: 'sshpk', reference: '1.15.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-asn1-0.2.4-8d2475dfab553bb33e77b54e59e880bb8ce23136/node_modules/asn1/',
    { name: 'asn1', reference: '0.2.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-bcrypt-pbkdf-1.0.2-a4301d389b6a43f9b67ff3ca11a3f6637e360e9e/node_modules/bcrypt-pbkdf/',
    { name: 'bcrypt-pbkdf', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-tweetnacl-0.14.5-5ae68177f192d4456269d108afa93ff8743f4f64/node_modules/tweetnacl/',
    { name: 'tweetnacl', reference: '0.14.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-dashdash-1.14.1-853cfa0f7cbe2fed5de20326b8dd581035f6e2f0/node_modules/dashdash/',
    { name: 'dashdash', reference: '1.14.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ecc-jsbn-0.1.2-3a83a904e54353287874c564b7549386849a98c9/node_modules/ecc-jsbn/',
    { name: 'ecc-jsbn', reference: '0.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jsbn-0.1.1-a5e654c2e5a2deb5f201d96cefbca80c0ef2f513/node_modules/jsbn/',
    { name: 'jsbn', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-getpass-0.1.7-5eff8e3e684d569ae4cb2b1282604e8ba62149fa/node_modules/getpass/',
    { name: 'getpass', reference: '0.1.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-typedarray-1.0.0-e479c80858df0c1b11ddda6940f96011fcda4a9a/node_modules/is-typedarray/',
    { name: 'is-typedarray', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-isstream-0.1.2-47e63f7af55afa6f92e1500e690eb8b8529c099a/node_modules/isstream/',
    { name: 'isstream', reference: '0.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-json-stringify-safe-5.0.1-1296a2d58fd45f19a0f6ce01d65701e2c735b6eb/node_modules/json-stringify-safe/',
    { name: 'json-stringify-safe', reference: '5.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-oauth-sign-0.9.0-47a7b016baa68b5fa0ecf3dee08a85c679ac6455/node_modules/oauth-sign/',
    { name: 'oauth-sign', reference: '0.9.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-performance-now-2.1.0-6309f4e0e5fa913ec1c69307ae364b4b377c9e7b/node_modules/performance-now/',
    { name: 'performance-now', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-qs-6.5.2-cb3ae806e8740444584ef154ce8ee98d403f3e36/node_modules/qs/',
    { name: 'qs', reference: '6.5.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-tough-cookie-2.4.3-53f36da3f47783b0925afa06ff9f3b165280f781/node_modules/tough-cookie/',
    { name: 'tough-cookie', reference: '2.4.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-tough-cookie-2.5.0-cd9fb2a0aa1d5a12b473bd9fb96fa3dcff65ade2/node_modules/tough-cookie/',
    { name: 'tough-cookie', reference: '2.5.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-psl-1.1.29-60f580d360170bb722a797cc704411e6da850c67/node_modules/psl/',
    { name: 'psl', reference: '1.1.29' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-tunnel-agent-0.6.0-27a5dea06b36b04a0a9966774b290868f0fc40fd/node_modules/tunnel-agent/',
    { name: 'tunnel-agent', reference: '0.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-uuid-3.3.2-1b4af4955eb3077c501c23872fc6513811587131/node_modules/uuid/',
    { name: 'uuid', reference: '3.3.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-request-promise-native-1.0.5-5281770f68e0c9719e5163fd3fab482215f4fda5/node_modules/request-promise-native/',
    { name: 'request-promise-native', reference: '1.0.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-request-promise-core-1.1.1-3eee00b2c5aa83239cfb04c5700da36f81cd08b6/node_modules/request-promise-core/',
    { name: 'request-promise-core', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-stealthy-require-1.1.1-35b09875b4ff49f26a777e509b3090a3226bf24b/node_modules/stealthy-require/',
    { name: 'stealthy-require', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/',
    { name: 'sax', reference: '1.2.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-symbol-tree-3.2.2-ae27db38f660a7ae2e1c3b7d1bc290819b8519e6/node_modules/symbol-tree/',
    { name: 'symbol-tree', reference: '3.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-w3c-hr-time-1.0.1-82ac2bff63d950ea9e3189a58a65625fedf19045/node_modules/w3c-hr-time/',
    { name: 'w3c-hr-time', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-browser-process-hrtime-0.1.3-616f00faef1df7ec1b5bf9cfe2bdc3170f26c7b4/node_modules/browser-process-hrtime/',
    { name: 'browser-process-hrtime', reference: '0.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ws-5.2.2-dffef14866b8e8dc9133582514d1befaf96e980f/node_modules/ws/',
    { name: 'ws', reference: '5.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-async-limiter-1.0.0-78faed8c3d074ab81f22b4e985d79e8738f720f8/node_modules/async-limiter/',
    { name: 'async-limiter', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-xml-name-validator-3.0.0-6ae73e06de4d8c6e47f9fb181f78d648ad457c6a/node_modules/xml-name-validator/',
    { name: 'xml-name-validator', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-environment-node-23.4.0-57e80ed0841dea303167cce8cd79521debafde10/node_modules/jest-environment-node/',
    { name: 'jest-environment-node', reference: '23.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-get-type-22.4.3-e3a8504d8479342dd4420236b322869f18900ce4/node_modules/jest-get-type/',
    { name: 'jest-get-type', reference: '22.4.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-jasmine2-23.6.0-840e937f848a6c8638df24360ab869cc718592e0/node_modules/jest-jasmine2/',
    { name: 'jest-jasmine2', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-co-4.6.0-6ea6bdf3d853ae54ccb8e47bfa0bf3f9031fb184/node_modules/co/',
    { name: 'co', reference: '4.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-expect-23.6.0-1e0c8d3ba9a581c87bd71fb9bc8862d443425f98/node_modules/expect/',
    { name: 'expect', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-diff-23.6.0-1500f3f16e850bb3d71233408089be099f610c7d/node_modules/jest-diff/',
    { name: 'jest-diff', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-diff-3.5.0-800c0dd1e0a8bfbc95835c202ad220fe317e5a12/node_modules/diff/',
    { name: 'diff', reference: '3.5.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pretty-format-23.6.0-5eaac8eeb6b33b987b7fe6097ea6a8a146ab5760/node_modules/pretty-format/',
    { name: 'pretty-format', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-matcher-utils-23.6.0-726bcea0c5294261a7417afb6da3186b4b8cac80/node_modules/jest-matcher-utils/',
    { name: 'jest-matcher-utils', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-regex-util-23.3.0-5f86729547c2785c4002ceaa8f849fe8ca471bc5/node_modules/jest-regex-util/',
    { name: 'jest-regex-util', reference: '23.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-generator-fn-1.0.0-969d49e1bb3329f6bb7f09089be26578b2ddd46a/node_modules/is-generator-fn/',
    { name: 'is-generator-fn', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-each-23.6.0-ba0c3a82a8054387016139c733a05242d3d71575/node_modules/jest-each/',
    { name: 'jest-each', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-snapshot-23.6.0-f9c2625d1b18acda01ec2d2b826c0ce58a5aa17a/node_modules/jest-snapshot/',
    { name: 'jest-snapshot', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-resolve-23.6.0-cf1d1a24ce7ee7b23d661c33ba2150f3aebfa0ae/node_modules/jest-resolve/',
    { name: 'jest-resolve', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-browser-resolve-1.11.3-9b7cbb3d0f510e4cb86bdbd796124d28b5890af6/node_modules/browser-resolve/',
    { name: 'browser-resolve', reference: '1.11.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-resolve-1.1.7-203114d82ad2c5ed9e8e0411b3932875e889e97b/node_modules/resolve/',
    { name: 'resolve', reference: '1.1.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-resolve-1.8.1-82f1ec19a423ac1fbd080b0bab06ba36e84a7a26/node_modules/resolve/',
    { name: 'resolve', reference: '1.8.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-realpath-native-1.0.2-cd51ce089b513b45cf9b1516c82989b51ccc6560/node_modules/realpath-native/',
    { name: 'realpath-native', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-util-promisify-1.0.0-440f7165a459c9a16dc145eb8e72f35687097030/node_modules/util.promisify/',
    { name: 'util.promisify', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/',
    { name: 'define-properties', reference: '1.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-keys-1.0.12-09c53855377575310cca62f55bb334abff7b3ed2/node_modules/object-keys/',
    { name: 'object-keys', reference: '1.0.12' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-getownpropertydescriptors-2.0.3-8758c846f5b407adab0f236e0986f14b051caa16/node_modules/object.getownpropertydescriptors/',
    { name: 'object.getownpropertydescriptors', reference: '2.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-es-abstract-1.12.0-9dbbdd27c6856f0001421ca18782d786bf8a6165/node_modules/es-abstract/',
    { name: 'es-abstract', reference: '1.12.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-es-to-primitive-1.2.0-edf72478033456e8dda8ef09e00ad9650707f377/node_modules/es-to-primitive/',
    { name: 'es-to-primitive', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/',
    { name: 'is-callable', reference: '1.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/',
    { name: 'is-date-object', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-symbol-1.0.2-a055f6ae57192caee329e7a860118b497a950f38/node_modules/is-symbol/',
    { name: 'is-symbol', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-symbols-1.0.0-ba1a8f1af2a0fc39650f5c850367704122063b44/node_modules/has-symbols/',
    { name: 'has-symbols', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/',
    { name: 'function-bind', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/',
    { name: 'has', reference: '1.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/',
    { name: 'is-regex', reference: '1.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7/node_modules/natural-compare/',
    { name: 'natural-compare', reference: '1.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-validate-23.6.0-36761f99d1ed33fcd425b4e4c5595d62b6597474/node_modules/jest-validate/',
    { name: 'jest-validate', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-leven-2.1.0-c2e7a9f772094dee9d34202ae8acce4687875580/node_modules/leven/',
    { name: 'leven', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-haste-map-23.6.0-2e3eb997814ca696d62afdb3f2529f5bbc935e16/node_modules/jest-haste-map/',
    { name: 'jest-haste-map', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fb-watchman-2.0.0-54e9abf7dfa2f26cd9b1636c588c1afc05de5d58/node_modules/fb-watchman/',
    { name: 'fb-watchman', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-bser-2.0.0-9ac78d3ed5d915804fd87acb158bc797147a1719/node_modules/bser/',
    { name: 'bser', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-node-int64-0.4.0-87a9065cdb355d3182d8f94ce11188b825c68a3b/node_modules/node-int64/',
    { name: 'node-int64', reference: '0.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-docblock-23.2.0-f085e1f18548d99fdd69b20207e6fd55d91383a7/node_modules/jest-docblock/',
    { name: 'jest-docblock', reference: '23.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-detect-newline-2.1.0-f41f1c10be4b00e87b5f13da680759f2c5bfd3e2/node_modules/detect-newline/',
    { name: 'detect-newline', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-serializer-23.0.1-a3776aeb311e90fe83fab9e533e85102bd164165/node_modules/jest-serializer/',
    { name: 'jest-serializer', reference: '23.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-worker-23.2.0-faf706a8da36fae60eb26957257fa7b5d8ea02b9/node_modules/jest-worker/',
    { name: 'jest-worker', reference: '23.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-merge-stream-1.0.1-4041202d508a342ba00174008df0c251b8c135e1/node_modules/merge-stream/',
    { name: 'merge-stream', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/',
    { name: 'readable-stream', reference: '2.3.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-process-nextick-args-2.0.0-a37d732f4271b4ab1ad070d35508e8290788ffaa/node_modules/process-nextick-args/',
    { name: 'process-nextick-args', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/',
    { name: 'string_decoder', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/',
    { name: 'util-deprecate', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-sane-2.5.2-b4dc1861c21b427e929507a3e751e2a2cb8ab3fa/node_modules/sane/',
    { name: 'sane', reference: '2.5.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/',
    { name: 'anymatch', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/',
    { name: 'extend-shallow', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/',
    { name: 'extend-shallow', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/',
    { name: 'to-regex-range', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/',
    { name: 'snapdragon', reference: '0.8.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/',
    { name: 'base', reference: '0.11.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/',
    { name: 'cache-base', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/',
    { name: 'collection-visit', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/',
    { name: 'map-visit', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/',
    { name: 'object-visit', reference: '1.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-component-emitter-1.2.1-137918d6d78283f7df7a6b7c5a63e140e69425e6/node_modules/component-emitter/',
    { name: 'component-emitter', reference: '1.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/',
    { name: 'get-value', reference: '2.0.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/',
    { name: 'has-value', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/',
    { name: 'has-value', reference: '0.3.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/',
    { name: 'has-values', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/',
    { name: 'has-values', reference: '0.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-set-value-2.0.0-71ae4a88f0feefbbf52d1ea604f3fb315ebb6274/node_modules/set-value/',
    { name: 'set-value', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-set-value-0.4.3-7db08f9d3d22dc7f78e53af3c3bf4666ecdfccf1/node_modules/set-value/',
    { name: 'set-value', reference: '0.4.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/',
    { name: 'is-plain-object', reference: '2.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/',
    { name: 'split-string', reference: '3.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/',
    { name: 'assign-symbols', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/',
    { name: 'to-object-path', reference: '0.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-union-value-1.0.0-5c71c34cb5bad5dcebe3ea0cd08207ba5aa1aea4/node_modules/union-value/',
    { name: 'union-value', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/',
    { name: 'arr-union', reference: '3.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/',
    { name: 'unset-value', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/',
    { name: 'class-utils', reference: '0.3.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/',
    { name: 'define-property', reference: '0.2.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/',
    { name: 'define-property', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/',
    { name: 'define-property', reference: '2.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/',
    { name: 'is-descriptor', reference: '0.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/',
    { name: 'is-descriptor', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/',
    { name: 'is-accessor-descriptor', reference: '0.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/',
    { name: 'is-accessor-descriptor', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/',
    { name: 'is-data-descriptor', reference: '0.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/',
    { name: 'is-data-descriptor', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/',
    { name: 'static-extend', reference: '0.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/',
    { name: 'object-copy', reference: '0.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/',
    { name: 'copy-descriptor', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-mixin-deep-1.3.1-a49e7268dce1a0d9698e45326c5626df3543d0fe/node_modules/mixin-deep/',
    { name: 'mixin-deep', reference: '1.3.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/',
    { name: 'pascalcase', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/',
    { name: 'map-cache', reference: '0.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/',
    { name: 'source-map-resolve', reference: '0.5.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/',
    { name: 'atob', reference: '2.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/',
    { name: 'decode-uri-component', reference: '0.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/',
    { name: 'resolve-url', reference: '0.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/',
    { name: 'source-map-url', reference: '0.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/',
    { name: 'urix', reference: '0.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/',
    { name: 'use', reference: '3.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/',
    { name: 'snapdragon-node', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/',
    { name: 'snapdragon-util', reference: '3.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/',
    { name: 'to-regex', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/',
    { name: 'regex-not', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/',
    { name: 'safe-regex', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/',
    { name: 'ret', reference: '0.1.15' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/',
    { name: 'posix-character-classes', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/',
    { name: 'fragment-cache', reference: '0.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/',
    { name: 'nanomatch', reference: '1.2.13' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/',
    { name: 'is-windows', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/',
    { name: 'object.pick', reference: '1.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-capture-exit-1.2.0-1c5fcc489fd0ab00d4f1ac7ae1072e3173fbab6f/node_modules/capture-exit/',
    { name: 'capture-exit', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-rsvp-3.6.2-2e96491599a96cde1b515d5674a8f7a91452926a/node_modules/rsvp/',
    { name: 'rsvp', reference: '3.6.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-exec-sh-0.2.2-2a5e7ffcbd7d0ba2755bdecb16e5a427dfbdec36/node_modules/exec-sh/',
    { name: 'exec-sh', reference: '0.2.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-merge-1.2.1-38bebf80c3220a8a487b6fcfb3941bb11720c145/node_modules/merge/',
    { name: 'merge', reference: '1.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-walker-1.0.7-2f7f9b8fd10d677262b18a884e28d19618e028fb/node_modules/walker/',
    { name: 'walker', reference: '1.0.7' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-makeerror-1.0.11-e01a5c9109f2af79660e4e8b9587790184f5a96c/node_modules/makeerror/',
    { name: 'makeerror', reference: '1.0.11' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-tmpl-1.0.4-23640dd7b42d00433911140820e5cf440e521dd1/node_modules/tmpl/',
    { name: 'tmpl', reference: '1.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-watch-0.18.0-28095476c6df7c90c963138990c0a5423eb4b986/node_modules/watch/',
    { name: 'watch', reference: '0.18.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-resolve-dependencies-23.6.0-b4526af24c8540d9a3fab102c15081cf509b723d/node_modules/jest-resolve-dependencies/',
    { name: 'jest-resolve-dependencies', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-runner-23.6.0-3894bd219ffc3f3cb94dc48a4170a2e6f23a5a38/node_modules/jest-runner/',
    { name: 'jest-runner', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-leak-detector-23.6.0-e4230fd42cf381a1a1971237ad56897de7e171de/node_modules/jest-leak-detector/',
    { name: 'jest-leak-detector', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-runtime-23.6.0-059e58c8ab445917cd0e0d84ac2ba68de8f23082/node_modules/jest-runtime/',
    { name: 'jest-runtime', reference: '23.6.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-write-file-atomic-2.3.0-1ff61575c2e2a4e8e510d6fa4e243cce183999ab/node_modules/write-file-atomic/',
    { name: 'write-file-atomic', reference: '2.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/',
    { name: 'imurmurhash', reference: '0.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/',
    { name: 'signal-exit', reference: '3.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-yargs-11.1.0-90b869934ed6e871115ea2ff58b03f4724ed2d77/node_modules/yargs/',
    { name: 'yargs', reference: '11.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-cliui-4.1.0-348422dbe82d800b3022eef4f6ac10bf2e4d1b49/node_modules/cliui/',
    { name: 'cliui', reference: '4.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/',
    { name: 'string-width', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/',
    { name: 'string-width', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/',
    { name: 'is-fullwidth-code-point', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/',
    { name: 'is-fullwidth-code-point', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-wrap-ansi-2.1.0-d8fc3d284dd05794fe84973caecdd1cf824fdd85/node_modules/wrap-ansi/',
    { name: 'wrap-ansi', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/',
    { name: 'code-point-at', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-decamelize-1.2.0-f6534d15148269b20352e7bee26f501f9a191290/node_modules/decamelize/',
    { name: 'decamelize', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-get-caller-file-1.0.3-f978fa4c90d1dfe7ff2d6beda2a515e713bdcf4a/node_modules/get-caller-file/',
    { name: 'get-caller-file', reference: '1.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-os-locale-2.1.0-42bc2900a6b5b8bd17376c8e882b65afccf24bf2/node_modules/os-locale/',
    { name: 'os-locale', reference: '2.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-execa-0.7.0-944becd34cc41ee32a63a9faf27ad5a65fc59777/node_modules/execa/',
    { name: 'execa', reference: '0.7.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-execa-1.0.0-c6236a5bb4df6d6f15e88e7f017798216749ddd8/node_modules/execa/',
    { name: 'execa', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-cross-spawn-5.1.0-e8bd0efee58fcff6f8f94510a0a554bbfa235449/node_modules/cross-spawn/',
    { name: 'cross-spawn', reference: '5.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/',
    { name: 'cross-spawn', reference: '6.0.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-lru-cache-4.1.4-51cc46e8e6d9530771c857e24ccc720ecdbcc031/node_modules/lru-cache/',
    { name: 'lru-cache', reference: '4.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pseudomap-1.0.2-f052a28da70e618917ef0a8ac34c1ae5a68286b3/node_modules/pseudomap/',
    { name: 'pseudomap', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-yallist-3.0.3-b4b049e314be545e3ce802236d6cd22cd91c3de9/node_modules/yallist/',
    { name: 'yallist', reference: '3.0.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/',
    { name: 'shebang-command', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/',
    { name: 'shebang-regex', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/',
    { name: 'which', reference: '1.3.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/',
    { name: 'isexe', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-get-stream-3.0.0-8e943d1358dc37555054ecbe2edb05aa174ede14/node_modules/get-stream/',
    { name: 'get-stream', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-get-stream-4.1.0-c1b255575f3dc21d59bfc79cd3d2b46b1c3a54b5/node_modules/get-stream/',
    { name: 'get-stream', reference: '4.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/',
    { name: 'is-stream', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/',
    { name: 'npm-run-path', reference: '2.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/',
    { name: 'path-key', reference: '2.0.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/',
    { name: 'p-finally', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/',
    { name: 'strip-eof', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-lcid-1.0.0-308accafa0bc483a3867b4b6f2b9506251d1b835/node_modules/lcid/',
    { name: 'lcid', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-invert-kv-1.0.0-104a8e4aaca6d3d8cd157a8ef8bfab2d7a3ffdb6/node_modules/invert-kv/',
    { name: 'invert-kv', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-mem-1.1.0-5edd52b485ca1d900fe64895505399a0dfa45f76/node_modules/mem/',
    { name: 'mem', reference: '1.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-mimic-fn-1.2.0-820c86a39334640e99516928bd03fca88057d022/node_modules/mimic-fn/',
    { name: 'mimic-fn', reference: '1.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-require-directory-2.1.1-8c64ad5fd30dab1c976e2344ffe7f792a6a6df42/node_modules/require-directory/',
    { name: 'require-directory', reference: '2.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/',
    { name: 'set-blocking', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-which-module-2.0.0-d9ef07dce77b9902b8a3a8fa4b31c3e3f7e6e87a/node_modules/which-module/',
    { name: 'which-module', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-y18n-3.2.1-6d15fba884c08679c0d77e88e7759e811e07fa41/node_modules/y18n/',
    { name: 'y18n', reference: '3.2.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-yargs-parser-9.0.2-9ccf6a43460fe4ed40a9bb68f48d43b8a68cc077/node_modules/yargs-parser/',
    { name: 'yargs-parser', reference: '9.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-camelcase-4.1.0-d545635be1e33c542649c69173e5de6acfae34dd/node_modules/camelcase/',
    { name: 'camelcase', reference: '4.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-buffer-from-1.1.1-32713bc028f75c02fdb710d7c7bcec1f2c6070ef/node_modules/buffer-from/',
    { name: 'buffer-from', reference: '1.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-node-notifier-5.3.0-c77a4a7b84038733d5fb351aafd8a268bfe19a01/node_modules/node-notifier/',
    { name: 'node-notifier', reference: '5.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-growly-1.3.0-f10748cbe76af964b7c96c93c6bcc28af120c081/node_modules/growly/',
    { name: 'growly', reference: '1.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-shellwords-0.1.1-d6b9181c1a48d397324c84871efbcfc73fc0654b/node_modules/shellwords/',
    { name: 'shellwords', reference: '0.1.1' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-string-length-2.0.0-d40dbb686a3ace960c1cffca562bf2c45f8363ed/node_modules/string-length/',
    { name: 'string-length', reference: '2.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9/node_modules/astral-regex/',
    { name: 'astral-regex', reference: '1.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-core-7.1.6-3733cbee4317429bc87c62b29cf8587dba7baeb3/node_modules/@babel/core/',
    { name: '@babel/core', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-generator-7.1.6-001303cf87a5b9d093494a4bf251d7b5d03d3999/node_modules/@babel/generator/',
    { name: '@babel/generator', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-types-7.1.6-0adb330c3a281348a190263aceb540e10f04bcce/node_modules/@babel/types/',
    { name: '@babel/types', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helpers-7.1.5-68bfc1895d685f2b8f1995e788dbfe1f6ccb1996/node_modules/@babel/helpers/',
    { name: '@babel/helpers', reference: '7.1.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-template-7.1.2-090484a574fef5a2d2d7726a674eceda5c5b5644/node_modules/@babel/template/',
    { name: '@babel/template', reference: '7.1.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-parser-7.1.6-16e97aca1ec1062324a01c5a6a7d0df8dd189854/node_modules/@babel/parser/',
    { name: '@babel/parser', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-traverse-7.1.6-c8db9963ab4ce5b894222435482bd8ea854b7b5c/node_modules/@babel/traverse/',
    { name: '@babel/traverse', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-function-name-7.1.0-a0ceb01685f73355d4360c1247f582bfafc8ff53/node_modules/@babel/helper-function-name/',
    { name: '@babel/helper-function-name', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-get-function-arity-7.0.0-83572d4320e2a4657263734113c42868b64e49c3/node_modules/@babel/helper-get-function-arity/',
    { name: '@babel/helper-get-function-arity', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-split-export-declaration-7.0.0-3aae285c0311c2ab095d997b8c9a94cad547d813/node_modules/@babel/helper-split-export-declaration/',
    { name: '@babel/helper-split-export-declaration', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-preset-env-7.1.6-a0bf4b96b6bfcf6e000afc5b72b4abe7cc13ae97/node_modules/@babel/preset-env/',
    { name: '@babel/preset-env', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-module-imports-7.0.0-96081b7111e486da4d2cd971ad1a4fe216cc2e3d/node_modules/@babel/helper-module-imports/',
    { name: '@babel/helper-module-imports', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-plugin-utils-7.0.0-bbb3fbee98661c569034237cc03967ba99b4f250/node_modules/@babel/helper-plugin-utils/',
    { name: '@babel/helper-plugin-utils', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-async-generator-functions-7.1.0-41c1a702e10081456e23a7b74d891922dd1bb6ce/node_modules/@babel/plugin-proposal-async-generator-functions/',
    { name: '@babel/plugin-proposal-async-generator-functions', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-remap-async-to-generator-7.1.0-361d80821b6f38da75bd3f0785ece20a88c5fe7f/node_modules/@babel/helper-remap-async-to-generator/',
    { name: '@babel/helper-remap-async-to-generator', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-annotate-as-pure-7.0.0-323d39dd0b50e10c7c06ca7d7638e6864d8c5c32/node_modules/@babel/helper-annotate-as-pure/',
    { name: '@babel/helper-annotate-as-pure', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-wrap-function-7.1.0-8cf54e9190706067f016af8f75cb3df829cc8c66/node_modules/@babel/helper-wrap-function/',
    { name: '@babel/helper-wrap-function', reference: '7.1.0' }
  ],
  [
    './.pnp/externals/pnp-700ef535efb74f629e1d4179b7c087ca71598812/node_modules/@babel/plugin-syntax-async-generators/',
    { name: '@babel/plugin-syntax-async-generators', reference: 'pnp:700ef535efb74f629e1d4179b7c087ca71598812' }
  ],
  [
    './.pnp/externals/pnp-2fcc5c9b6d95aef842f0ddcf8012983018578bda/node_modules/@babel/plugin-syntax-async-generators/',
    { name: '@babel/plugin-syntax-async-generators', reference: 'pnp:2fcc5c9b6d95aef842f0ddcf8012983018578bda' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-json-strings-7.0.0-3b4d7b5cf51e1f2e70f52351d28d44fc2970d01e/node_modules/@babel/plugin-proposal-json-strings/',
    { name: '@babel/plugin-proposal-json-strings', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-syntax-json-strings-7.0.0-0d259a68090e15b383ce3710e01d5b23f3770cbd/node_modules/@babel/plugin-syntax-json-strings/',
    { name: '@babel/plugin-syntax-json-strings', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-object-rest-spread-7.0.0-9a17b547f64d0676b6c9cecd4edf74a82ab85e7e/node_modules/@babel/plugin-proposal-object-rest-spread/',
    { name: '@babel/plugin-proposal-object-rest-spread', reference: '7.0.0' }
  ],
  [
    './.pnp/externals/pnp-1bf85085bb7bcebf7ec5585626babe5a0a899875/node_modules/@babel/plugin-syntax-object-rest-spread/',
    { name: '@babel/plugin-syntax-object-rest-spread', reference: 'pnp:1bf85085bb7bcebf7ec5585626babe5a0a899875' }
  ],
  [
    './.pnp/externals/pnp-c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e/node_modules/@babel/plugin-syntax-object-rest-spread/',
    { name: '@babel/plugin-syntax-object-rest-spread', reference: 'pnp:c80bdd57e2b0d09d1e22912b6c601ab5b4b9f75e' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-optional-catch-binding-7.0.0-b610d928fe551ff7117d42c8bb410eec312a6425/node_modules/@babel/plugin-proposal-optional-catch-binding/',
    { name: '@babel/plugin-proposal-optional-catch-binding', reference: '7.0.0' }
  ],
  [
    './.pnp/externals/pnp-e41313624e174e2a0226f94e9c37d10479b9c671/node_modules/@babel/plugin-syntax-optional-catch-binding/',
    { name: '@babel/plugin-syntax-optional-catch-binding', reference: 'pnp:e41313624e174e2a0226f94e9c37d10479b9c671' }
  ],
  [
    './.pnp/externals/pnp-d8fabc0f71e09f7047d8576625a0959fc0684dcd/node_modules/@babel/plugin-syntax-optional-catch-binding/',
    { name: '@babel/plugin-syntax-optional-catch-binding', reference: 'pnp:d8fabc0f71e09f7047d8576625a0959fc0684dcd' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-proposal-unicode-property-regex-7.0.0-498b39cd72536cd7c4b26177d030226eba08cd33/node_modules/@babel/plugin-proposal-unicode-property-regex/',
    { name: '@babel/plugin-proposal-unicode-property-regex', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-regex-7.0.0-2c1718923b57f9bbe64705ffe5640ac64d9bdb27/node_modules/@babel/helper-regex/',
    { name: '@babel/helper-regex', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regexpu-core-4.2.0-a3744fa03806cffe146dea4421a3e73bdcc47b1d/node_modules/regexpu-core/',
    { name: 'regexpu-core', reference: '4.2.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regenerate-1.4.0-4a856ec4b56e4077c557589cae85e7a4c8869a11/node_modules/regenerate/',
    { name: 'regenerate', reference: '1.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regenerate-unicode-properties-7.0.0-107405afcc4a190ec5ed450ecaa00ed0cafa7a4c/node_modules/regenerate-unicode-properties/',
    { name: 'regenerate-unicode-properties', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regjsgen-0.4.0-c1eb4c89a209263f8717c782591523913ede2561/node_modules/regjsgen/',
    { name: 'regjsgen', reference: '0.4.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regjsparser-0.3.0-3c326da7fcfd69fa0d332575a41c8c0cdf588c96/node_modules/regjsparser/',
    { name: 'regjsparser', reference: '0.3.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-unicode-match-property-ecmascript-1.0.4-8ed2a32569961bce9227d09cd3ffbb8fed5f020c/node_modules/unicode-match-property-ecmascript/',
    { name: 'unicode-match-property-ecmascript', reference: '1.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-unicode-canonical-property-names-ecmascript-1.0.4-2619800c4c825800efdd8343af7dd9933cbe2818/node_modules/unicode-canonical-property-names-ecmascript/',
    { name: 'unicode-canonical-property-names-ecmascript', reference: '1.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-unicode-property-aliases-ecmascript-1.0.4-5a533f31b4317ea76f17d807fa0d116546111dd0/node_modules/unicode-property-aliases-ecmascript/',
    { name: 'unicode-property-aliases-ecmascript', reference: '1.0.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-unicode-match-property-value-ecmascript-1.0.2-9f1dc76926d6ccf452310564fd834ace059663d4/node_modules/unicode-match-property-value-ecmascript/',
    { name: 'unicode-match-property-value-ecmascript', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-arrow-functions-7.0.0-a6c14875848c68a3b4b3163a486535ef25c7e749/node_modules/@babel/plugin-transform-arrow-functions/',
    { name: '@babel/plugin-transform-arrow-functions', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-async-to-generator-7.1.0-109e036496c51dd65857e16acab3bafdf3c57811/node_modules/@babel/plugin-transform-async-to-generator/',
    { name: '@babel/plugin-transform-async-to-generator', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-block-scoped-functions-7.0.0-482b3f75103927e37288b3b67b65f848e2aa0d07/node_modules/@babel/plugin-transform-block-scoped-functions/',
    { name: '@babel/plugin-transform-block-scoped-functions', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-block-scoping-7.1.5-3e8e0bc9a5104519923302a24f748f72f2f61f37/node_modules/@babel/plugin-transform-block-scoping/',
    { name: '@babel/plugin-transform-block-scoping', reference: '7.1.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-classes-7.1.0-ab3f8a564361800cbc8ab1ca6f21108038432249/node_modules/@babel/plugin-transform-classes/',
    { name: '@babel/plugin-transform-classes', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-define-map-7.1.0-3b74caec329b3c80c116290887c0dd9ae468c20c/node_modules/@babel/helper-define-map/',
    { name: '@babel/helper-define-map', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-optimise-call-expression-7.0.0-a2920c5702b073c15de51106200aa8cad20497d5/node_modules/@babel/helper-optimise-call-expression/',
    { name: '@babel/helper-optimise-call-expression', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-replace-supers-7.1.0-5fc31de522ec0ef0899dc9b3e7cf6a5dd655f362/node_modules/@babel/helper-replace-supers/',
    { name: '@babel/helper-replace-supers', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-member-expression-to-functions-7.0.0-8cd14b0a0df7ff00f009e7d7a436945f47c7a16f/node_modules/@babel/helper-member-expression-to-functions/',
    { name: '@babel/helper-member-expression-to-functions', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-computed-properties-7.0.0-2fbb8900cd3e8258f2a2ede909b90e7556185e31/node_modules/@babel/plugin-transform-computed-properties/',
    { name: '@babel/plugin-transform-computed-properties', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-destructuring-7.1.3-e69ff50ca01fac6cb72863c544e516c2b193012f/node_modules/@babel/plugin-transform-destructuring/',
    { name: '@babel/plugin-transform-destructuring', reference: '7.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-dotall-regex-7.0.0-73a24da69bc3c370251f43a3d048198546115e58/node_modules/@babel/plugin-transform-dotall-regex/',
    { name: '@babel/plugin-transform-dotall-regex', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-duplicate-keys-7.0.0-a0601e580991e7cace080e4cf919cfd58da74e86/node_modules/@babel/plugin-transform-duplicate-keys/',
    { name: '@babel/plugin-transform-duplicate-keys', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-exponentiation-operator-7.1.0-9c34c2ee7fd77e02779cfa37e403a2e1003ccc73/node_modules/@babel/plugin-transform-exponentiation-operator/',
    { name: '@babel/plugin-transform-exponentiation-operator', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-builder-binary-assignment-operator-visitor-7.1.0-6b69628dfe4087798e0c4ed98e3d4a6b2fbd2f5f/node_modules/@babel/helper-builder-binary-assignment-operator-visitor/',
    { name: '@babel/helper-builder-binary-assignment-operator-visitor', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-explode-assignable-expression-7.1.0-537fa13f6f1674df745b0c00ec8fe4e99681c8f6/node_modules/@babel/helper-explode-assignable-expression/',
    { name: '@babel/helper-explode-assignable-expression', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-for-of-7.0.0-f2ba4eadb83bd17dc3c7e9b30f4707365e1c3e39/node_modules/@babel/plugin-transform-for-of/',
    { name: '@babel/plugin-transform-for-of', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-function-name-7.1.0-29c5550d5c46208e7f730516d41eeddd4affadbb/node_modules/@babel/plugin-transform-function-name/',
    { name: '@babel/plugin-transform-function-name', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-literals-7.0.0-2aec1d29cdd24c407359c930cdd89e914ee8ff86/node_modules/@babel/plugin-transform-literals/',
    { name: '@babel/plugin-transform-literals', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-amd-7.1.0-f9e0a7072c12e296079b5a59f408ff5b97bf86a8/node_modules/@babel/plugin-transform-modules-amd/',
    { name: '@babel/plugin-transform-modules-amd', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-module-transforms-7.1.0-470d4f9676d9fad50b324cdcce5fbabbc3da5787/node_modules/@babel/helper-module-transforms/',
    { name: '@babel/helper-module-transforms', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-simple-access-7.1.0-65eeb954c8c245beaa4e859da6188f39d71e585c/node_modules/@babel/helper-simple-access/',
    { name: '@babel/helper-simple-access', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-commonjs-7.1.0-0a9d86451cbbfb29bd15186306897c67f6f9a05c/node_modules/@babel/plugin-transform-modules-commonjs/',
    { name: '@babel/plugin-transform-modules-commonjs', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-systemjs-7.1.3-2119a3e3db612fd74a19d88652efbfe9613a5db0/node_modules/@babel/plugin-transform-modules-systemjs/',
    { name: '@babel/plugin-transform-modules-systemjs', reference: '7.1.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-hoist-variables-7.0.0-46adc4c5e758645ae7a45deb92bab0918c23bb88/node_modules/@babel/helper-hoist-variables/',
    { name: '@babel/helper-hoist-variables', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-modules-umd-7.1.0-a29a7d85d6f28c3561c33964442257cc6a21f2a8/node_modules/@babel/plugin-transform-modules-umd/',
    { name: '@babel/plugin-transform-modules-umd', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-new-target-7.0.0-ae8fbd89517fa7892d20e6564e641e8770c3aa4a/node_modules/@babel/plugin-transform-new-target/',
    { name: '@babel/plugin-transform-new-target', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-object-super-7.1.0-b1ae194a054b826d8d4ba7ca91486d4ada0f91bb/node_modules/@babel/plugin-transform-object-super/',
    { name: '@babel/plugin-transform-object-super', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-parameters-7.1.0-44f492f9d618c9124026e62301c296bf606a7aed/node_modules/@babel/plugin-transform-parameters/',
    { name: '@babel/plugin-transform-parameters', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-helper-call-delegate-7.1.0-6a957f105f37755e8645343d3038a22e1449cc4a/node_modules/@babel/helper-call-delegate/',
    { name: '@babel/helper-call-delegate', reference: '7.1.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-regenerator-7.0.0-5b41686b4ed40bef874d7ed6a84bdd849c13e0c1/node_modules/@babel/plugin-transform-regenerator/',
    { name: '@babel/plugin-transform-regenerator', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-regenerator-transform-0.13.3-264bd9ff38a8ce24b06e0636496b2c856b57bcbb/node_modules/regenerator-transform/',
    { name: 'regenerator-transform', reference: '0.13.3' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-shorthand-properties-7.0.0-85f8af592dcc07647541a0350e8c95c7bf419d15/node_modules/@babel/plugin-transform-shorthand-properties/',
    { name: '@babel/plugin-transform-shorthand-properties', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-spread-7.0.0-93583ce48dd8c85e53f3a46056c856e4af30b49b/node_modules/@babel/plugin-transform-spread/',
    { name: '@babel/plugin-transform-spread', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-sticky-regex-7.0.0-30a9d64ac2ab46eec087b8530535becd90e73366/node_modules/@babel/plugin-transform-sticky-regex/',
    { name: '@babel/plugin-transform-sticky-regex', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-template-literals-7.0.0-084f1952efe5b153ddae69eb8945f882c7a97c65/node_modules/@babel/plugin-transform-template-literals/',
    { name: '@babel/plugin-transform-template-literals', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-typeof-symbol-7.0.0-4dcf1e52e943e5267b7313bff347fdbe0f81cec9/node_modules/@babel/plugin-transform-typeof-symbol/',
    { name: '@babel/plugin-transform-typeof-symbol', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-unicode-regex-7.0.0-c6780e5b1863a76fe792d90eded9fcd5b51d68fc/node_modules/@babel/plugin-transform-unicode-regex/',
    { name: '@babel/plugin-transform-unicode-regex', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-browserslist-4.3.4-4477b737db6a1b07077275b24791e680d4300425/node_modules/browserslist/',
    { name: 'browserslist', reference: '4.3.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-caniuse-lite-1.0.30000912-08e650d4090a9c0ab06bfd2b46b7d3ad6dcaea28/node_modules/caniuse-lite/',
    { name: 'caniuse-lite', reference: '1.0.30000912' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-electron-to-chromium-1.3.85-5c46f790aa96445cabc57eb9d17346b1e46476fe/node_modules/electron-to-chromium/',
    { name: 'electron-to-chromium', reference: '1.3.85' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-node-releases-1.0.5-a641adcc968b039a27345d92ef10b093e5cbd41d/node_modules/node-releases/',
    { name: 'node-releases', reference: '1.0.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-js-levenshtein-1.1.4-3a56e3cbf589ca0081eb22cd9ba0b1290a16d26e/node_modules/js-levenshtein/',
    { name: 'js-levenshtein', reference: '1.1.4' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-preset-flow-7.0.0-afd764835d9535ec63d8c7d4caf1c06457263da2/node_modules/@babel/preset-flow/',
    { name: '@babel/preset-flow', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-transform-flow-strip-types-7.1.6-4b7be62604d39e63cfe23b1d00d63e9fb7e763ba/node_modules/@babel/plugin-transform-flow-strip-types/',
    { name: '@babel/plugin-transform-flow-strip-types', reference: '7.1.6' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-@babel-plugin-syntax-flow-7.0.0-70638aeaad9ee426bc532e51523cff8ff02f6f17/node_modules/@babel/plugin-syntax-flow/',
    { name: '@babel/plugin-syntax-flow', reference: '7.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-jest-pnp-resolver-1.0.2-470384ae9ea31f72136db52618aa4010ff23b715/node_modules/jest-pnp-resolver/',
    { name: 'jest-pnp-resolver', reference: '1.0.2' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/',
    { name: 'nice-try', reference: '1.0.5' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-pump-3.0.0-b4a2116815bde2f4e1ea602354e8c75565107a64/node_modules/pump/',
    { name: 'pump', reference: '3.0.0' }
  ],
  [
    '../../../home/aram/.cache/yarn/v4/npm-end-of-stream-1.4.1-ed29634d19baba463b6ce6b80a37213eab71ec43/node_modules/end-of-stream/',
    { name: 'end-of-stream', reference: '1.4.1' }
  ],
  ['./', topLevelLocator]
]);
exports.findPackageLocator = function findPackageLocator(location) {
  let relativeLocation = normalizePath(path.relative(__dirname, location));

  if (!relativeLocation.match(isStrictRegExp)) relativeLocation = `./${relativeLocation}`;

  if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
    relativeLocation = `${relativeLocation}/`;

  let match;

  if (relativeLocation.length >= 212 && relativeLocation[211] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 212)))) return blacklistCheck(match);

  if (relativeLocation.length >= 196 && relativeLocation[195] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 196)))) return blacklistCheck(match);

  if (relativeLocation.length >= 194 && relativeLocation[193] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 194)))) return blacklistCheck(match);

  if (relativeLocation.length >= 192 && relativeLocation[191] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 192)))) return blacklistCheck(match);

  if (relativeLocation.length >= 190 && relativeLocation[189] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 190)))) return blacklistCheck(match);

  if (relativeLocation.length >= 188 && relativeLocation[187] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 188)))) return blacklistCheck(match);

  if (relativeLocation.length >= 186 && relativeLocation[185] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 186)))) return blacklistCheck(match);

  if (relativeLocation.length >= 184 && relativeLocation[183] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 184)))) return blacklistCheck(match);

  if (relativeLocation.length >= 182 && relativeLocation[181] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 182)))) return blacklistCheck(match);

  if (relativeLocation.length >= 180 && relativeLocation[179] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 180)))) return blacklistCheck(match);

  if (relativeLocation.length >= 178 && relativeLocation[177] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 178)))) return blacklistCheck(match);

  if (relativeLocation.length >= 177 && relativeLocation[176] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 177)))) return blacklistCheck(match);

  if (relativeLocation.length >= 176 && relativeLocation[175] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 176)))) return blacklistCheck(match);

  if (relativeLocation.length >= 174 && relativeLocation[173] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 174)))) return blacklistCheck(match);

  if (relativeLocation.length >= 172 && relativeLocation[171] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 172)))) return blacklistCheck(match);

  if (relativeLocation.length >= 170 && relativeLocation[169] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 170)))) return blacklistCheck(match);

  if (relativeLocation.length >= 168 && relativeLocation[167] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 168)))) return blacklistCheck(match);

  if (relativeLocation.length >= 166 && relativeLocation[165] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 166)))) return blacklistCheck(match);

  if (relativeLocation.length >= 164 && relativeLocation[163] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 164)))) return blacklistCheck(match);

  if (relativeLocation.length >= 162 && relativeLocation[161] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 162)))) return blacklistCheck(match);

  if (relativeLocation.length >= 160 && relativeLocation[159] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 160)))) return blacklistCheck(match);

  if (relativeLocation.length >= 158 && relativeLocation[157] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 158)))) return blacklistCheck(match);

  if (relativeLocation.length >= 156 && relativeLocation[155] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 156)))) return blacklistCheck(match);

  if (relativeLocation.length >= 154 && relativeLocation[153] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 154)))) return blacklistCheck(match);

  if (relativeLocation.length >= 152 && relativeLocation[151] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 152)))) return blacklistCheck(match);

  if (relativeLocation.length >= 151 && relativeLocation[150] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 151)))) return blacklistCheck(match);

  if (relativeLocation.length >= 150 && relativeLocation[149] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 150)))) return blacklistCheck(match);

  if (relativeLocation.length >= 148 && relativeLocation[147] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 148)))) return blacklistCheck(match);

  if (relativeLocation.length >= 147 && relativeLocation[146] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 147)))) return blacklistCheck(match);

  if (relativeLocation.length >= 146 && relativeLocation[145] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 146)))) return blacklistCheck(match);

  if (relativeLocation.length >= 145 && relativeLocation[144] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 145)))) return blacklistCheck(match);

  if (relativeLocation.length >= 144 && relativeLocation[143] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 144)))) return blacklistCheck(match);

  if (relativeLocation.length >= 143 && relativeLocation[142] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 143)))) return blacklistCheck(match);

  if (relativeLocation.length >= 142 && relativeLocation[141] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 142)))) return blacklistCheck(match);

  if (relativeLocation.length >= 141 && relativeLocation[140] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 141)))) return blacklistCheck(match);

  if (relativeLocation.length >= 140 && relativeLocation[139] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 140)))) return blacklistCheck(match);

  if (relativeLocation.length >= 139 && relativeLocation[138] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 139)))) return blacklistCheck(match);

  if (relativeLocation.length >= 138 && relativeLocation[137] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 138)))) return blacklistCheck(match);

  if (relativeLocation.length >= 137 && relativeLocation[136] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 137)))) return blacklistCheck(match);

  if (relativeLocation.length >= 136 && relativeLocation[135] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 136)))) return blacklistCheck(match);

  if (relativeLocation.length >= 135 && relativeLocation[134] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 135)))) return blacklistCheck(match);

  if (relativeLocation.length >= 134 && relativeLocation[133] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 134)))) return blacklistCheck(match);

  if (relativeLocation.length >= 133 && relativeLocation[132] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 133)))) return blacklistCheck(match);

  if (relativeLocation.length >= 132 && relativeLocation[131] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 132)))) return blacklistCheck(match);

  if (relativeLocation.length >= 131 && relativeLocation[130] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 131)))) return blacklistCheck(match);

  if (relativeLocation.length >= 130 && relativeLocation[129] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 130)))) return blacklistCheck(match);

  if (relativeLocation.length >= 129 && relativeLocation[128] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 129)))) return blacklistCheck(match);

  if (relativeLocation.length >= 128 && relativeLocation[127] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 128)))) return blacklistCheck(match);

  if (relativeLocation.length >= 127 && relativeLocation[126] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 127)))) return blacklistCheck(match);

  if (relativeLocation.length >= 126 && relativeLocation[125] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 126)))) return blacklistCheck(match);

  if (relativeLocation.length >= 125 && relativeLocation[124] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 125)))) return blacklistCheck(match);

  if (relativeLocation.length >= 124 && relativeLocation[123] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 124)))) return blacklistCheck(match);

  if (relativeLocation.length >= 123 && relativeLocation[122] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 123)))) return blacklistCheck(match);

  if (relativeLocation.length >= 122 && relativeLocation[121] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 122)))) return blacklistCheck(match);

  if (relativeLocation.length >= 121 && relativeLocation[120] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 121)))) return blacklistCheck(match);

  if (relativeLocation.length >= 120 && relativeLocation[119] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 120)))) return blacklistCheck(match);

  if (relativeLocation.length >= 119 && relativeLocation[118] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 119)))) return blacklistCheck(match);

  if (relativeLocation.length >= 118 && relativeLocation[117] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 118)))) return blacklistCheck(match);

  if (relativeLocation.length >= 117 && relativeLocation[116] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 117)))) return blacklistCheck(match);

  if (relativeLocation.length >= 116 && relativeLocation[115] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 116)))) return blacklistCheck(match);

  if (relativeLocation.length >= 115 && relativeLocation[114] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 115)))) return blacklistCheck(match);

  if (relativeLocation.length >= 114 && relativeLocation[113] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 114)))) return blacklistCheck(match);

  if (relativeLocation.length >= 113 && relativeLocation[112] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 113)))) return blacklistCheck(match);

  if (relativeLocation.length >= 112 && relativeLocation[111] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 112)))) return blacklistCheck(match);

  if (relativeLocation.length >= 111 && relativeLocation[110] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 111)))) return blacklistCheck(match);

  if (relativeLocation.length >= 110 && relativeLocation[109] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 110)))) return blacklistCheck(match);

  if (relativeLocation.length >= 109 && relativeLocation[108] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 109)))) return blacklistCheck(match);

  if (relativeLocation.length >= 108 && relativeLocation[107] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 108)))) return blacklistCheck(match);

  if (relativeLocation.length >= 107 && relativeLocation[106] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 107)))) return blacklistCheck(match);

  if (relativeLocation.length >= 106 && relativeLocation[105] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 106)))) return blacklistCheck(match);

  if (relativeLocation.length >= 104 && relativeLocation[103] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 104)))) return blacklistCheck(match);

  if (relativeLocation.length >= 86 && relativeLocation[85] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 86)))) return blacklistCheck(match);

  if (relativeLocation.length >= 2 && relativeLocation[1] === '/')
    if ((match = locatorsByLocations.get(relativeLocation.substr(0, 2)))) return blacklistCheck(match);

  return null;
};

/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, { extensions }) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        unqualifiedPath = nextUnqualifiedPath;
        continue;
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

// eslint-disable-next-line no-unused-vars
function normalizePath(fsPath) {
  return process.platform === 'win32' ? fsPath.replace(backwardSlashRegExp, '/') : fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = { std: 1 };

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = { name: null, reference: null };

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({ name, reference }) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, { considerBuiltins = true } = {}) {
  // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

  if (request === `pnpapi`) {
    return pnpFile;
  }

  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(issuer)) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "null")`,
        {
          request,
          issuer
        }
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer
          }
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            { request, issuer, dependencyName }
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${
              issuerLocator.reference
            }" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            { request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName }
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            { request, issuer, dependencyName }
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${
              issuerLocator.reference
            }" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `
            )})`,
            { request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates }
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = { name: dependencyName, reference: dependencyReference };
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${
          dependencyLocator.reference
        }" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        { request, issuer, dependencyLocator: Object.assign({}, dependencyLocator) }
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  { extensions = Object.keys(Module._extensions) } = {}
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, { extensions });

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      { unqualifiedPath }
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, { considerBuiltins, extensions } = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, { considerBuiltins });
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, { considerBuiltins });
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer
          }
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath, { extensions });
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, { request, issuer });
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    if (patchedModules.has(request)) {
      module.exports = patchedModules.get(request)(module.exports);
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    let issuers;

    if (options) {
      const optionNames = new Set(Object.keys(options));
      optionNames.delete('paths');

      if (optionNames.size > 0) {
        throw makeError(
          `UNSUPPORTED`,
          `Some options passed to require() aren't supported by PnP yet (${Array.from(optionNames).join(', ')})`
        );
      }

      if (options.paths) {
        issuers = options.paths.map(entry => `${path.normalize(entry)}/`);
      }
    }

    if (!issuers) {
      const issuerModule = getIssuerModule(parent);
      const issuer = issuerModule ? issuerModule.filename : `${process.cwd()}/`;

      issuers = [issuer];
    }

    let firstError;

    for (const issuer of issuers) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, issuer);
      } catch (error) {
        firstError = firstError || error;
        continue;
      }

      return resolution !== null ? resolution : request;
    }

    throw firstError;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);
};

exports.setupCompatibilityLayer = () => {
  // see https://github.com/browserify/resolve/blob/master/lib/caller.js
  const getCaller = () => {
    const origPrepareStackTrace = Error.prepareStackTrace;

    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack;
    Error.prepareStackTrace = origPrepareStackTrace;

    return stack[2].getFileName();
  };

  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({ name, reference });
      }
    }
  }

  // We need to shim the "resolve" module, because Liftoff uses it in order to find the location
  // of the module in the dependency tree. And Liftoff is used to power Gulp, which doesn't work
  // at all unless modulePath is set, which we cannot configure from any other way than through
  // the Liftoff pipeline (the key isn't whitelisted for env or cli options).

  patchedModules.set('resolve', realResolve => {
    const mustBeShimmed = caller => {
      const callerLocator = exports.findPackageLocator(caller);

      return callerLocator && callerLocator.name === 'liftoff';
    };

    const attachCallerToOptions = (caller, options) => {
      if (!options.basedir) {
        options.basedir = path.dirname(caller);
      }
    };

    const resolveSyncShim = (request, { basedir }) => {
      return exports.resolveRequest(request, basedir, {
        considerBuiltins: false
      });
    };

    const resolveShim = (request, options, callback) => {
      setImmediate(() => {
        let error;
        let result;

        try {
          result = resolveSyncShim(request, options);
        } catch (thrown) {
          error = thrown;
        }

        callback(error, result);
      });
    };

    return Object.assign(
      (request, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        } else if (!options) {
          options = {};
        }

        const caller = getCaller();
        attachCallerToOptions(caller, options);

        if (mustBeShimmed(caller)) {
          return resolveShim(request, options, callback);
        } else {
          return realResolve.sync(request, options, callback);
        }
      },
      {
        sync: (request, options) => {
          if (!options) {
            options = {};
          }

          const caller = getCaller();
          attachCallerToOptions(caller, options);

          if (mustBeShimmed(caller)) {
            return resolveSyncShim(request, options);
          } else {
            return realResolve.sync(request, options);
          }
        },
        isCore: request => {
          return realResolve.isCore(request);
        }
      }
    );
  });
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{ code, message, data }, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
