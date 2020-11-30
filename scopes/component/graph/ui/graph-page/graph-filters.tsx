import React from 'react';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { CheckBox } from '@teambit/ui.input.check-box';

type GraphFilters = {
  isFiltered: boolean;
  onChangeFilter: (isFiltered: boolean) => void;
  disable?: boolean;
} & CardProps;

export function GraphFilters({ onChangeFilter, isFiltered, disable, ...rest }: GraphFilters) {
  return (
    <Card {...rest}>
      <div>
        {/* show non-runtime === !isFiltered */}
        <CheckBox checked={!isFiltered} disabled={disable} onChange={(e) => onChangeFilter(!e.target.checked)}>
          {' '}
          show non-runtime
        </CheckBox>
      </div>
    </Card>
  );
}
