/** @flow */

import R from 'ramda';
import { BaseType } from './types';

type TypeName = string;
type TypeImplementation = Class<Types.BaseType>;

type ModelProp = {
  __type: TypeName,
  val: any
};

export type PropsSchema = {
  [string]: TypeName
};

type RawProps = Object;

type ModelProps = {
  [string]: ModelProp
};

export type DefaultProps = {
  [string]: string | Function
};

// TODO: define as object TypeName:TypeImplementation
type TypesDefinition = {
  [TypeName]: TypeImplementation
};

export default class ExtensionPropTypes {
  types: TypesDefinition;
  constructor({ types }: { types: TypesDefinition }) {
    this.types = types;
  }

  parseRaw(rawProps: RawProps, propsSchema: PropsSchema, defaultProps: DefaultProps) {
    const addDefaultValToProps = userDefinedProps => (value, key) => {
      if (!R.has(key, userDefinedProps)) {
        userDefinedProps[key] = typeof value === 'function' ? value(userDefinedProps) : value;
      }
    };

    R.forEachObjIndexed(addDefaultValToProps(rawProps), defaultProps);
    this.validateRaw(rawProps, propsSchema);
  }

  parseModel(modelProps: ModelProps) {}

  validateRaw(rawProps: RawProps, propsSchema: PropsSchema) {
    const validateVal = (value, key) => {
      if (!R.has(key, propsSchema)) {
        // TODO: make a nice error
        throw new Error(`unknown prop - the prop ${key} is not defined in the extension propTypes`);
      }
      const validateFunc = propsSchema[key].validate;
      const typeName = propsSchema[key].name;
      if (!validateFunc(value)) {
        // TODO: make a nice error
        throw new Error(`the prop ${key} has an invalid value of type ${typeName}`);
      }
    };

    R.forEachObjIndexed(validateVal, rawProps);
  }
}
