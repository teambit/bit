import { ComponentType } from 'react';
import { ScopeModel } from '.';

export type GetScopeOptions = {
  useScope?: () => { scope: ScopeModel | undefined };
  Corner?: ComponentType
};
