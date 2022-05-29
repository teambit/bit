import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';

/**
 * e.g. `{ [key: string]: boolean };`
 * the "[key: string]" is the "parameter", and the "boolean" is the "type".
 */
export class IndexSignatureSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly params: ParameterSchema[];
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(readonly location: Location, params: ParameterSchema[], type: SchemaNode) {
    super();
    this.params = params;
    this.type = type;
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    return `[${paramsStr}]: ${this.type.toString()}`;
  }
}
