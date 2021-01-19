import doctrine from 'doctrine';
import * as reactDocs from 'react-docgen';

import logger from '../../logger/logger';
import { pathNormalizeToLinux } from '../../utils';
import { PathOsBased } from '../../utils/path';
import extractDataRegex from '../extract-data-regex';
import { Doclet } from '../types';

function formatProperties(props) {
  const parseDescription = (description) => {
    // an extra step is needed to parse the properties description correctly. without this step
    // it'd show the entire tag, e.g. `@property {propTypes.string} text - Button text.`
    // instead of just `text - Button text.`.
    try {
      const descriptionAST = doctrine.parse(description, { unwrap: true, recoverable: true, sloppy: true });
      if (descriptionAST && descriptionAST.tags[0]) return descriptionAST.tags[0].description;
    } catch (err) {
      // failed to parse the react property, that's fine, it'll return the original description
    }
    return description;
  };
  return Object.keys(props).map((name) => {
    const { type, description, required, defaultValue, flowType, tsType } = props[name];

    return {
      name,
      description: parseDescription(description),
      required,
      type: stringifyType(type || flowType || tsType),
      defaultValue,
    };
  });
}

function formatMethods(methods) {
  return Object.keys(methods).map((key) => {
    const { returns, modifiers, params, docblock, name } = methods[key];
    return {
      name,
      description: docblock,
      returns,
      modifiers,
      params,
    };
  });
}

function fromReactDocs({ description, displayName, props, methods }, filePath): Doclet {
  return {
    filePath: pathNormalizeToLinux(filePath),
    name: displayName,
    description,
    properties: formatProperties(props),
    access: 'public',
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    methods: formatMethods(methods),
  };
}

function stringifyType(prop: { name: string; value?: any; raw?: string }): string {
  if (!prop) return '?'; // TODO!

  const { name } = prop;
  let transformed;

  switch (name) {
    default:
      transformed = name;
      break;
    case 'func':
      transformed = 'function';
      break;
    case 'shape':
      transformed = JSON.stringify(
        Object.keys(prop.value).reduce((acc = {}, current) => {
          acc[current] = stringifyType(prop.value[current]);
          return acc;
        }, {})
      );
      break;
    case 'enum':
      transformed = prop.value.map((enumProp) => enumProp.value).join(' | ');
      break;
    case 'instanceOf':
      transformed = prop.value;
      break;
    case 'union':
      transformed = prop.value ? prop.value.map((p) => stringifyType(p)).join(' | ') : prop.raw;
      break;
    case 'arrayOf':
      transformed = `${stringifyType(prop.value)}[]`;
      break;
  }

  return transformed;
}

export default async function parse(data: string, filePath: PathOsBased): Promise<Doclet[] | undefined> {
  const doclets: Array<Doclet> = [];
  try {
    const componentsInfo = reactDocs.parse(data, reactDocs.resolver.findAllExportedComponentDefinitions, undefined, {
      configFile: false,
      filename: filePath, // should we use pathNormalizeToLinux(filePath) ?
    });

    if (componentsInfo) {
      return componentsInfo.map((componentInfo) => {
        const formatted = fromReactDocs(componentInfo, filePath);
        formatted.args = [];
        // this is a workaround to get the 'example' tag parsed when using react-docs
        // because as of now Docgen doesn't parse @example tag, instead, it shows it inside
        // the @description tag.
        extractDataRegex(formatted.description, doclets, filePath, false);
        formatted.description = doclets[0].description;
        formatted.examples = doclets[0].examples;
        return formatted;
      });
    }
  } catch (err) {
    logger.trace(`failed parsing docs using docgen on path ${filePath} with error`, err);
  }
  return undefined;
}
