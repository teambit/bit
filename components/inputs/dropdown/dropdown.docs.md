---
description: General Dropdown with buttons.
labels: ['input', 'dropdown', 'list', 'select']
---

import { MenuItem } from '@teambit/design.inputs.selectors.menu-item';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import { Dropdown } from './dropdown';

A Dropdown component that renders a complete and designed dropdown with placeholder, dropdown and buttons.

### Component usage

```js live
() => {
  const mockList = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return (
    <Dropdown placeholderContent="items list">
      {mockList.map((value, index) => (
        <MenuItem key={index} onClick={() => console.log(`click on ${value}`)}>
          {value}
        </MenuItem>
      ))}
    </Dropdown>
  );
};
```

```js live
() => {
  const mockList = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return (
    <Dropdown placeholderContent="checkbox items list">
      {mockList.map((value, index) => (
        <CheckboxItem key={index} onInputChanged={(e) => console.log(`click on ${value} ${e.target.checked}`)}>
          {value}
        </CheckboxItem>
      ))}
    </Dropdown>
  );
};
```
