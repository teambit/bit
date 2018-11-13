/** @flow */

import R from 'ramda';
import * as Types from './types';
import ExtensionInvalidConfig from './exceptions/extension-invalid-config';

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

  async parseRaw(rawProps: RawProps, propsSchema: PropsSchema, defaultProps: DefaultProps, context: Object = {}) {
    const addDefaultValToProps = userDefinedProps => (value, key) => {
      if (!R.has(key, userDefinedProps)) {
        userDefinedProps[key] = typeof value === 'function' ? value(userDefinedProps) : value;
      }
    };

    R.forEachObjIndexed(addDefaultValToProps(rawProps), defaultProps);
    await this.validateRaw(rawProps, propsSchema);
    const loadedProps = await _loadRaw(rawProps, propsSchema, context);
    return loadedProps;
  }

  async getFromStore(props) {
    const storeData = {
      models: [],
      files: []
    };

    const promises = [];

    const addPropToStoreData = store => (propVal, propName) => {
      const storeFunc = propVal.store.bind(propVal);
      const storeFuncP = async () => {
        const data = await storeFunc();
        store.models.push({
          name: propName,
          value: data.val,
          type: propVal.name
        });
        store.files = store.files.concat(data.files);
      };
      promises.push(storeFuncP());
    };

    R.forEachObjIndexed(addPropToStoreData(storeData), props);
    await Promise.all(promises);
    return storeData;
  }

  parseModel(modelProps: ModelProps) {}

  async validateRaw(rawProps: RawProps, propsSchema: PropsSchema) {
    const promises = [];

    const validateVal = (value, key) => {
      if (!R.has(key, propsSchema)) {
        // TODO: make a nice error
        throw new Error(`unknown prop - the prop ${key} is not defined in the extension propTypes`);
      }
      const validateFunc = propsSchema[key].validate;
      const typeName = propsSchema[key].name;
      const validateFuncP = Promise.resolve()
        .then(() => {
          return validateFunc(value);
        })
        .then((isValid) => {
          if (!isValid) {
            // TODO: make a nice error
            throw new ExtensionInvalidConfig(key, typeName);
          }
          return isValid;
        });
      promises.push(validateFuncP);
    };
    R.forEachObjIndexed(validateVal, rawProps);
    return Promise.all(promises);
  }
}

/**
 *
 * This function dosn't not validate, the validation should be done during the public function - parseRaw
 * @param {*} rawProps
 * @param {*} propsSchema
 */
async function _loadRaw(rawProps: RawProps, propsSchema: PropsSchema, context: Object = {}) {
  const loadedProps = {};
  const promises = [];
  const loadOne = (value, key) => {
    const ConstructorFunc = propsSchema[key];
    const ConstructorFuncP = Promise.resolve()
      .then(() => {
        return new ConstructorFunc(value, context);
      })
      .then((loadedProp) => {
        loadedProps[key] = loadedProp;
      });
    promises.push(ConstructorFuncP);
    // loadedProps[key] = await
  };

  R.forEachObjIndexed(loadOne, rawProps);
  // TODO: don't catch it here but in a better place
  try {
    await Promise.all(promises);
  } catch (e) {
    console.log('errrrr', e);
  }
  return loadedProps;
}
