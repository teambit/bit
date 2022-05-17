import React, { HTMLAttributes, useContext } from 'react';
import { DropdownComponentVersion } from '@teambit/component.ui.version-dropdown';
import { ComponentContext, ComponentModel } from '@teambit/component';

export type ComponentCompareVersionPickerProps = {
  base: DropdownComponentVersion;
  compare: DropdownComponentVersion;
  currentVersion?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareVersionPicker({}: ComponentCompareVersionPickerProps) {
  const component = useContext(ComponentContext);
}
