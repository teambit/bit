export type FileCompareResult = {
  fileName: string;
  baseContent: string;
  compareContent: string;
  status?: string;
  diffOutput?: string;
};

export type ComponentCompareQueryResponse = {
  id: string;
  code: Array<FileCompareResult>;
};
