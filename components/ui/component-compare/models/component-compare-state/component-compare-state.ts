export type ComponentCompareStateData = {
  id?: string;
  element?: React.ReactNode | null;
  controlled?: true;
  baseOverride?: string;
  compareOverride?: string;
};

export type ComponentCompareStateKey =
  | 'code'
  | 'aspects'
  | 'preview'
  | 'changelog'
  | 'docs'
  | 'versionPicker'
  | 'tabs'
  | 'drawer';

export type ComponentCompareState<
  K extends ComponentCompareStateKey = ComponentCompareStateKey,
  V extends ComponentCompareStateData = ComponentCompareStateData
> = Partial<Record<K, V>>;
