import React from 'react';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { CheckboxLabel } from '@teambit/evangelist.input.checkbox.label';

type GraphFiltersType = {
  isFiltered: boolean;
  showMetadata?: boolean;
  onChangeFilter: (isFiltered: boolean) => void;
  disable?: boolean;
} & CardProps;

export function GraphFilters({ onChangeFilter, isFiltered, disable, ...rest }: GraphFiltersType) {
  return (
    <Card {...rest}>
      <div>
        {/* show non-runtime === !isFiltered */}
        <CheckboxLabel
          checked={!isFiltered}
          disabled={disable}
          onInputChanged={(e) => onChangeFilter(!e.target.checked)}
        >
          {' '}
          show non-runtime
        </CheckboxLabel>
      </div>
    </Card>
  );
}
