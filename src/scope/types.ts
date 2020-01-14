export interface OneComponentPersistOptions {
  message?: string;
  version?: string;
  force?: boolean;
}

export interface ComponentToPersist {
  // TODO: change to real component instance
  component: any;
  persistOptions: OneComponentPersistOptions;
}

export interface PersistComponentsGeneralOptions {
  verbose?: boolean;
}
