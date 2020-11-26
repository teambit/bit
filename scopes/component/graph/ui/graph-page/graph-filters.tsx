import React from 'react';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { CheckBox } from '@teambit/ui.input.check-box';

type GraphFilters = {
  isFiltered: boolean;
  onChangeFilter: (isFiltered: boolean) => void;
} & CardProps;

export function GraphFilters({ onChangeFilter, isFiltered, ...rest }: GraphFilters) {
  return (
    <Card {...rest}>
      <div>
        <CheckBox checked={isFiltered} onChange={(e) => onChangeFilter(e.target.checked)}>
          {' '}
          show non-runtime
        </CheckBox>
      </div>
    </Card>
  );
}
