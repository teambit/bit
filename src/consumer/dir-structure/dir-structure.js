import R from 'ramda';
import { DEFAULT_DIR_STRUCTURE } from '../../constants';


export default class BitStructure {
  structureStr: string;
  constructor(structure?: string) {
    this.structureStr = structure || DEFAULT_DIR_STRUCTURE;
  }

  _getComponentStructurePart(componentStructure, componentPart) {
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

  get componentsDirStructure(): Object {
    const dirStructure = this.structureStr;
    const staticParts = [];
    const dynamicParts = [];
    dirStructure.split('/').forEach((dir) => {
      if (dir.startsWith('{') && dir.endsWith('}')) { // this is variable
        const dirStripped = dir.replace(/[{}]/g, '');
        const componentPart = this._getComponentStructurePart(dirStructure, dirStripped);
        dynamicParts.push(componentPart);
      } else {
        // todo: create a new exception class
        if (!R.isEmpty(dynamicParts)) throw new Error(`${dirStructure} is invalid, a static directory can not be after the dynamic part`);
        staticParts.push(dir);
      }
    });

    return { staticParts, dynamicParts };
  }

  parsePath
}
