/** @flow */

import R from 'ramda';
import * as Types from './types';
import typesFactory from './types/type-factory';
import ExtensionInvalidConfig from './exceptions/extension-invalid-config';
import PropTypeNotSupported from './exceptions/prop-type-not-supported';

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

  /**
   * props type can be of this.types or strings.
   * when the type is a string, replace it with the Type class that matches that string
   */
  loadPropsSchema(propsSchema: PropsSchema) {
    Object.keys(propsSchema).forEach((prop) => {
      if (R.is(String, propsSchema[prop])) {
        const typeClass = this.getTypeClassByString(propsSchema[prop]);
        // $FlowFixMe
        propsSchema[prop] = typeClass;
      }
    });
  }

  getTypeClassByString(typeStr: string): Class<Types.BaseType> {
    const typeInstance = typesFactory[typeStr];
    if (typeInstance) return typeInstance;
    if (typeStr.includes('<') && typeStr.includes('>')) {
      return this._getTypeClassOfTypeOf(typeStr);
    }
    throw new PropTypeNotSupported(typeStr);
  }

  /**
   * some types are super types, such as Array. Array can be array of strings or numbers and so on.
   * the string representation of such a type is: superType<subType>. For example, array<boolean>.
   */
  _getTypeClassOfTypeOf(typeStr: string): Class<Types.BaseType> {
    const [type, typeOf] = typeStr.replace('>', '').split('<');
    if (typesFactory[type] && typesFactory[typeOf]) {
      return typesFactory[type](typesFactory[typeOf]);
    }
    throw new PropTypeNotSupported(typeStr);
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

  async toStore(props) {
    const storeData = {
      models: [],
      bitObjects: []
    };

    const promises = [];

    const addPropToStoreData = store => (propVal, propName) => {
      const storeFuncP = async () => {
        const data = await propVal.toStore();
        store.models.push({
          name: propName,
          value: data.value,
          type: propVal.name
        });
        if (data.bitObjects) store.bitObjects.push(...data.bitObjects);
      };
      promises.push(storeFuncP());
    };

    R.forEachObjIndexed(addPropToStoreData(storeData), props);
    await Promise.all(promises);
    return storeData;
  }

  parseModel(modelProps: ModelProps) {}

  /**
   * throws an error for an invalid config
   */
  async validateRaw(rawProps: RawProps, propsSchema: PropsSchema) {
    const validateVal = async (value, key) => {
      if (!R.has(key, propsSchema)) {
        // TODO: make a nice error
        throw new Error(`unknown prop - the prop ${key} is not defined in the extension propTypes`);
      }
      const typeName = propsSchema[key].name;
      const isValid = await propsSchema[key].validate(value);
      if (!isValid) {
        // TODO: make a nice error
        throw new ExtensionInvalidConfig(key, typeName);
      }
      return isValid;
    };
    R.forEachObjIndexed(validateVal, rawProps);
  }
}

/**
 *
 * This function doesn't validate, the validation should be done during the public function - parseRaw
 * @param {*} rawProps
 * @param {*} propsSchema
 */
async function _loadRaw(rawProps: RawProps, propsSchema: PropsSchema, context: Object = {}) {
  const loadedProps = {};
  const promises = [];
  const loadOne = async (value, key) => {
    const typeInstance: Types.BaseType = propsSchema[key];
    await typeInstance.setValue(value, context);
    loadedProps[key] = typeInstance;
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
