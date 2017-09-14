// @flow
import R from 'ramda';
import { DEFAULT_DIR_STRUCTURE, DEFAULT_DIR_DEPENDENCIES_STRUCTURE } from '../../constants';

export default class BitStructure {
  structureStr: string;
  dependenciesDir: string;
  constructor(structure: Object) {
    this.structureStr = structure.components || DEFAULT_DIR_STRUCTURE;
    this.dependenciesDir = structure.dependencies || DEFAULT_DIR_DEPENDENCIES_STRUCTURE;
  }

  _getComponentStructurePart(componentStructure: string, componentPart: string): string {
    switch (componentPart) {
      case 'name':
        return 'name';
      case 'namespace':
        return 'box';
      case 'scope':
        return 'scope';
      case 'version':
        return 'version';
      default:
        throw new Error(`the ${componentPart} part of the component structure
           ${componentStructure} is invalid, it must be one of the following: "name", "namespace", "scope" or "version" `);
    }
  }

  get dependenciesDirStructure(): string {
    return this.dependenciesDir;
  }

  get componentsDirStructure(): Object {
    const dirStructure = this.structureStr;
    const staticParts = [];
    const dynamicParts = [];
    dirStructure.split('/').forEach((dir) => {
      if (dir.startsWith('{') && dir.endsWith('}')) {
        // this is a variable
        const dirStripped = dir.replace(/[{}]/g, '');
        const componentPart = this._getComponentStructurePart(dirStructure, dirStripped);
        dynamicParts.push(componentPart);
      } else {
        // todo: create a new exception class
        if (!R.isEmpty(dynamicParts)) {
          throw new Error(`${dirStructure} is invalid, a static directory can not be after the dynamic part`);
        }
        staticParts.push(dir);
      }
    });

    return { staticParts, dynamicParts };
  }
}
