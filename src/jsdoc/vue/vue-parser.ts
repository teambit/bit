import vuedoc from '@vuedoc/parser';
import * as domain from 'domain';

import logger from '../../logger/logger';
import { pathNormalizeToLinux } from '../../utils';
import { PathOsBased } from '../../utils/path';
import { Doclet } from '../types';

function formatProperty(prop) {
  const { name, description, type, required } = prop;
  return {
    name,
    description,
    required,
    type,
    defaultValue: {
      value: prop.default === '__undefined__' ? undefined : prop.default,
      computed: false,
    },
  };
}

function formatComputed(computed) {
  const { name, description } = computed;
  return {
    name,
    description,
    required: false,
    defaultValue: {
      value: null,
      computed: true,
    },
  };
}

function formatProperties(props, computeds) {
  const regularProps = props ? props.map(formatProperty) : [];
  const computedProps = computeds ? computeds.map(formatComputed) : [];
  return regularProps.concat(computedProps);
}

function formatMethod(method) {
  const { name, description, params } = method;
  return {
    name,
    description,
    // Private method won't be in the raw vue docs results, so what ever got here is public
    access: 'public',
    args: params,
    returns: method.return,
  };
}

function formatMethods(methods) {
  if (!methods) return [];
  return methods.map(formatMethod);
}

function fromVueDocs({ name, description, props, methods, computed }, filePath): Doclet {
  return {
    filePath: pathNormalizeToLinux(filePath),
    name,
    description,
    properties: formatProperties(props, computed),
    access: 'public',
    methods: formatMethods(methods),
  };
}

export default async function parse(data: string, filePath?: PathOsBased): Promise<Doclet[]> {
  const options = {
    filecontent: data,
  };

  return new Promise((resolve) => {
    try {
      // Wrapping this call with a domain since the vue docs parser call process.nextTick directly
      // see (https://gitlab.com/vuedoc/parser/blob/master/lib/parser/Parser.js#L72) which
      // results in sometime throw an unhandled error outside the promise which make the main process hang.
      // read more about it here:
      // https://gitlab.com/vuedoc/parser/issues/56#note_219267637
      const parsingDomain = domain.create();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      parsingDomain
        .on('error', (err) => {
          logger.debug(`failed parsing vue docs on path ${filePath} with unhandled error`, err);
          // never mind, ignore the doc of this source
          resolve([]);
        })
        .run(async () => {
          try {
            const vueDocs = await vuedoc.parse(options);
            const formattedDocs = fromVueDocs(vueDocs, filePath);
            resolve([formattedDocs]);
          } catch (e) {
            logger.debug(`failed parsing vue docs on path ${filePath} with error`, e);
            // never mind, ignore the doc of this source
            resolve([]);
          }
        });
    } catch (e) {
      logger.debug(`failed parsing vue docs on path ${filePath} with error`, e);
      // never mind, ignore the doc of this source
      resolve([]);
    }
  });
}
