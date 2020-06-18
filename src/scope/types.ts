export interface PersistOptions {
  message?: string;
  version?: string;
  force?: boolean;
}

export interface ComponentToPersist {
  // TODO: change to real component instance
  component: any;
  persistOptions: PersistOptions;
}

export interface PersistComponentsGeneralOptions {
  verbose?: boolean;
}
