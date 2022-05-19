import { useComponentCompareParams, getComponentCompareUrl } from '@teambit/component.ui.component-compare';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import React from 'react';
import styles from './composition-dropdown.module.scss';

export type CompositionDropdownProps = {
  dropdownItems: Array<{ label: string; value: string }>;
};

const baseCompQueryParam = 'compositionBase';
const compareCompQueryParam = 'compositionCompare';

export function CompositionDropdown(props: CompositionDropdownProps) {
  const { dropdownItems: data } = props;
  const query = useQuery();

  // const href = (link: string) => {
  //     const { componentId, ...params } = useComponentCompareParams();
  //     params.selectedCompositionBaseFile = link;
  //     params.selectedCompositionCompareFile = link;
  //     const result = getComponentCompareUrl(params);
  //     return result;
  // }

  return (
    <Dropdown
      dropClass={styles.menu}
      placeholder={
        <div className={styles.placeholder}>
          <div className={styles.placeholderTitle}>Helloooo</div>
          <Icon of="fat-arrow-down" />
        </div>
      }
    >
      <div>
        {data.map((item, index) => {
          return (
            <MenuLinkItem key={index} isActive={() => false} href={item.value}>
              <div>{item.label}</div>
            </MenuLinkItem>
          );
        })}
      </div>
    </Dropdown>
  );
}
