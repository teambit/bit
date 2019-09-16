// @flow

import vuedoc from '@vuedoc/parser';
import type { PathOsBased } from '../utils/path';
import type { Doclet } from './parser';
import { pathNormalizeToLinux } from '../utils';
import logger from '../logger/logger';

function formatProperty(prop) {
  const { name, description, type, required } = prop;
  return {
    name,
    description,
    required,
    type,
    defaultValue: {
      value: prop.default === '__undefined__' ? undefined : prop.default,
      computed: false
    }
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
      computed: true
    }
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
    returns: method.return
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
    methods: formatMethods(methods)
  };
}

export default async function parse(data: string, filePath: PathOsBased): Promise<Doclet | []> {
  const options = {
    filecontent: data
  };
  try {
    const vueDocs = await vuedoc.parse(options);
    const formattedDocs = fromVueDocs(vueDocs, filePath);
    return formattedDocs;
  } catch (e) {
    logger.debug(`failed parsing vue docs on path ${filePath} with error`);
    logger.debug(e);
    // never mind, ignore the doc of this source
  }
  return [];
}
