import React from 'react';
import { Icon } from '@teambit/design.elements.icon';
import { IconTextInput } from './icon-text';

export const BasicIconTextInput = () => (
  <IconTextInput
    placeholder="search..."
    // eslint-disable-next-line no-alert
    icon={<Icon of="discovery" style={{ cursor: 'pointer' }} onClick={() => alert('on icon click')} />}
    data-testid="test-input"
  />
);

export const IconTextInputWithImage = () => (
  <IconTextInput
    placeholder="search..."
    icon={
      <img
        src="https://static.bit.dev/bit-icons/filter.svg"
        style={{ cursor: 'pointer', top: '0.55em', right: '0.4em' }}
        // eslint-disable-next-line no-alert
        onClick={() => alert('on icon click')}
      />
    }
    data-testid="test-input"
  />
);

export const BigIconTextInputWithIcon = () => (
  <IconTextInput
    placeholder="bigger with font size"
    // eslint-disable-next-line no-alert
    icon={<Icon of="discovery" style={{ cursor: 'pointer' }} onClick={() => alert('on icon click')} />}
    data-testid="test-input"
    style={{ fontSize: 20 }}
  />
);

export const IconTextInputWithoutIcon = () => <IconTextInput placeholder="search..." data-testid="test-input" />;
