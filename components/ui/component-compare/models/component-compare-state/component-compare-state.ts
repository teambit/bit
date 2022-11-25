import { ComponentCompareModel } from '@teambit/component.ui.component-compare.models.component-compare-model';

export type RenderProps = { model: ComponentCompareModel; state: ComponentCompareState };

export type ComponentCompareState = {
  tabs?: {
    activeId?: string;
    onTabClicked?: (id?: string, _?: React.MouseEventHandler<HTMLAnchorElement>) => void;
    element?: React.ReactNode | null;
  };
  versionPicker?: {
    element?: React.ReactNode | null;
  };
  code?: {
    activeId?: string;
    onNodeClicked?: (id: string) => void;
  };
  aspects?: {
    activeId?: string;
    onNodeClicked?: (id: string) => void;
  };
  compositions?: {};
  overview?: {};
  metadata?: {};
};
