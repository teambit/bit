import { PathLinux } from '../utils/path';
import { Example } from './example-tag-parser';

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
  args?: Record<string, any>[];
  returns?: Record<string, any>;
  access?: string;
  examples?: Example[];
  methods?: Method[];
  properties?: DocProp[];
  static?: boolean;
};
