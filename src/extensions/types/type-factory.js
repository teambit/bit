// @flow
import * as Types from '.';

function arrayOf(type: Types.BaseType) {
  return new Types.ArrayOf(type);
}

const types = {
  string: new Types.String(),
  number: new Types.Number(),
  boolean: new Types.Boolean(),
  any: new Types.Any(),
  file: new Types.File(),
  array: arrayOf
};

export default types;
