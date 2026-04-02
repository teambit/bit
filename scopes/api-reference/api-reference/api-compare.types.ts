export type APIDiffDetail = {
  changeKind: string;
  description: string;
  impact: string;
  from?: string;
  to?: string;
};

export type APIDiffChange = {
  status: string;
  visibility: string;
  exportName: string;
  schemaType: string;
  schemaTypeRaw: string;
  impact: string;
  baseSignature?: string;
  compareSignature?: string;
  baseNode?: Record<string, any>;
  compareNode?: Record<string, any>;
  changes?: APIDiffDetail[];
};

export type APIDiffResult = {
  hasChanges: boolean;
  impact: string;
  publicChanges: APIDiffChange[];
  internalChanges: APIDiffChange[];
  changes: APIDiffChange[];
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  nonBreaking: number;
  patch: number;
};
