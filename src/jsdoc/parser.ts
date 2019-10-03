import doctrine from 'doctrine';
import exampleTagParser from './example-tag-parser';
import { PathLinux, PathOsBased } from '../utils/path';
import { pathNormalizeToLinux, getExt } from '../utils';
import vueParse from './vue-parser';
import logger from '../logger/logger';

const docgen = require('react-docgen');

export type Method = {
  name: string;
  description: string;
  args: [];
  access: 'public' | 'private' | '';
  returns: {};
  modifiers: [];
};

export type PropDefaultValue = {
  value: string;
  computed: boolean;
};

export type DocProp = {
  name: string;
  description: string;
  required: boolean;
  type: string;
  defaultValue: PropDefaultValue;
};

export type Doclet = {
  filePath: PathLinux;
  name: string;
  description: string;
  args?: Array;
  returns?: Object;
  access?: string;
  examples?: Array;
  methods?: Method[];
  properties?: DocProp[];
  static?: Boolean;
};

function formatTag(tag: Object): Object {
  delete tag.title;
  if (!tag.type) return tag;
  let formattedType = doctrine.type.stringify(tag.type);
  if (tag.type.type === doctrine.type.Syntax.TypeApplication) {
    // Doctrine adds a dot after the generic type for historical reasons.
    // see here for more info: https://github.com/eslint/doctrine/issues/185
    formattedType = formattedType.replace('.<', '<');
  }
  if (tag.type.type === doctrine.type.Syntax.OptionalType) {
    // Doctrine shows an optional type with a suffix `=` (e.g. `string=`), we prefer the more
    // common syntax `?` (e.g. `string?`)
    formattedType = formattedType.replace('=', '?');
  }
  tag.type = formattedType;

  return tag;
}

function extractDataRegex(doc: string, doclets: Array<Doclet>, filePath: PathOsBased) {
  const commentsAst = doctrine.parse(doc.trim(), { unwrap: true, recoverable: true, sloppy: true });
  if (!commentsAst) return;

  const args = [];
  let description = commentsAst.description;
  let returns = {};
  let isStatic = false;
  let access = 'public';
  const examples = [];
  const properties = [];
  let name = '';
  let render = '';

  commentsAst.tags.forEach(tag => {
    switch (tag.title) {
      case 'desc':
      case 'description':
        description = tag.description;
        break;
      case 'name':
        name = tag.name;
        break;
      case 'param':
      case 'arg':
      case 'argument':
        args.push(formatTag(tag));
        break;
      case 'returns':
      case 'return':
        returns = formatTag(tag);
        break;
      case 'static':
        isStatic = true;
        break;
      case 'private':
      case 'protected':
        access = tag.title;
        break;
      case 'access':
        access = tag.access;
        break;
      case 'example':
        examples.push(exampleTagParser(tag.description));
        break;
      case 'property':
        properties.push(formatTag(tag));
        break;
      case 'render':
        render = tag.description;
        break;
      default:
        break;
    }
  });

  const doclet: Doclet = {
    name, // todo: find the function/method name by regex
    description,
    args,
    returns,
    access,
    examples,
    render,
    properties,
    static: isStatic,
    filePath: pathNormalizeToLinux(filePath)
  };
  doclets.push(doclet);
}

function formatProperties(props) {
  const parseDescription = description => {
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
  return Object.keys(props).map(name => {
    const { type, description, required, defaultValue, flowType } = props[name];

    return {
      name,
      description: parseDescription(description),
      required,
      type: stringifyType(type || flowType),
      defaultValue
    };
  });
}

function formatMethods(methods) {
  return Object.keys(methods).map(key => {
    const { returns, modifiers, params, docblock, name } = methods[key];
    return {
      name,
      description: docblock,
      returns,
      modifiers,
      params
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
    methods: formatMethods(methods)
  };
}

function stringifyType(prop: { name: string; value?: any }): string {
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
      transformed = prop.value.map(enumProp => enumProp.value).join(' | ');
      break;
    case 'instanceOf':
      transformed = prop.value;
      break;
    case 'union':
      transformed = prop.value.map(prop => stringifyType(prop)).join(' | ');
      break;
    case 'arrayOf':
      transformed = `${stringifyType(prop.value)}[]`;
      break;
  }

  return transformed;
}

export default async function parse(data: string, filePath: PathOsBased): Promise<Doclet | []> {
  const doclets: Array<Doclet> = [];
  if (filePath && getExt(filePath) === 'vue') {
    return vueParse(data, filePath);
  }
  try {
    const reactDocs = docgen.parse(data);
    if (reactDocs) {
      const formatted = fromReactDocs(reactDocs, filePath);
      formatted.args = [];
      // this is a workaround to get the 'example' tag parsed when using react-docs
      // because as of now Docgen doesn't parse @example tag, instead, it shows it inside
      // the @description tag.
      extractDataRegex(formatted.description, doclets, filePath);
      formatted.description = doclets[0].description;
      formatted.examples = doclets[0].examples;
      return formatted;
    }
  } catch (err) {
    logger.debug(`failed parsing docs using docgen on path ${filePath} with error`);
    logger.debug(err);
  }
  try {
    /**
     * [ \t]*  => can start with any number of tabs
     * \/\*\*  => must start with exact `/**`
     * \s*     => may follow with any number of white spaces
     * [^*]*   => anything except star may repeat
     * ([^\*]|(\*(?!\/)))* => may follow with stars as long as there is no "/" after the star
     * \*\/ => must finish with a star and then \.
     * This was taken as a combination of:
     * https://stackoverflow.com/questions/35905181/regex-for-jsdoc-comments
     * https://github.com/neogeek/jsdoc-regex/blob/master/index.js
     */
    const jsdocRegex = /[ \t]*\/\*\*\s*\n([^*]|(\*(?!\/)))*\*\//g;
    const docs = data.match(jsdocRegex);
    // populate doclets array
    docs.forEach(doc => extractDataRegex(doc, doclets, filePath));
  } catch (e) {
    // never mind, ignore the doc of this source
    logger.debug(`failed parsing docs using on path ${filePath} with error`);
    logger.debug(e);
  }
  return doclets.filter(doclet => doclet.access === 'public');
}
