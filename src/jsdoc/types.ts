import { PathLinux } from '../utils/path';

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
