export type ComponentCompareStateData = {
  id?: string;
  element?: React.ReactNode | null;
  controlled?: boolean;
};

export type ComponentCompareStateKey =
  | 'code'
  | 'aspects'
  | 'composition'
  | 'changelog'
  | 'overview'
  | 'versionPicker'
  | 'tabs';

export type ComponentCompareState<
  K extends ComponentCompareStateKey = ComponentCompareStateKey,
  V extends ComponentCompareStateData = ComponentCompareStateData
> = Partial<Record<K, V>>;
