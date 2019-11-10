import { PathLinux, PathOsBased } from '../utils/path';
import { getExt } from '../utils';
import reactParse from './react';
import vueParse from './vue';

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
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  args?: Array;
  returns?: Record<string, any>;
  access?: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  examples?: Array;
  methods?: Method[];
  properties?: DocProp[];
  static?: boolean;
};

export default async function parse(data: string, filePath?: PathOsBased): Promise<Doclet | []> {
  if (filePath && getExt(filePath) === 'vue') {
    return vueParse(data, filePath);
  }
  return reactParse(data, filePath);
}
