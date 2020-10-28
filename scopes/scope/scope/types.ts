export type Serializable = {
  toString(): string;
};

export type Metadata = {
  [key: string]: Serializable;
};

export type DataToPersist = {
  metadata: Metadata;
  files: string[];
};
