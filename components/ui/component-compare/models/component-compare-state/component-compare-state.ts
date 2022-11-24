import { ComponentCompareModel } from '@teambit/component.ui.component-compare.models.component-compare-model';

export type RenderProps = { model: ComponentCompareModel; state: ComponentCompareState };

export type ComponentCompareState = {
  tabs: {
    activeId: string;
    onTabClicked: (id?: string) => React.MouseEventHandler<HTMLAnchorElement>;
    element: (props: RenderProps) => React.ReactNode | null;
  };
  versionPicker?: {
    element: (props: RenderProps) => React.ReactNode | null;
  };
  metadata?: {
    [TabId in string]: Record<string, any>;
  };
};
