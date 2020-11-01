// import React, { useMemo, useCallback } from 'react';
// import { useHistory } from 'react-router-dom';
// import { Icon } from '@teambit/evangelist.elements.icon';
// import { Input } from '@teambit/evangelist.input.input';
// import { ComponentTree } from './component-tree';
// import styles from './styles.module.scss';
// import { OverviewLink } from './overview-link/overview-link';
// import { ComponentID } from '@teambit/component';
// import { DeprecationInfo } from '@teambit/deprecation';
// import { Descriptor } from '@teambit/environments';

// export type Component = {
//   id: ComponentID;
//   status?: any;
//   deprection?: DeprecationInfo;
//   env?: Descriptor;
// };

// type SideBarProps = {
//   components: Component[];
//   selected?: string;
//   onSelectComponent?: (component: ComponentID) => void;
// } & React.HTMLAttributes<HTMLDivElement>;

// export function SideBar({ components, selected, ...rest }: SideBarProps) {
//   // TODO - @oded check if this is still used
//   const componentsData = useMemo(() => components.map((component) => component), [components]);
//   const history = useHistory();

//   const handleSelect = useCallback(
//     (id: string, event?: React.MouseEvent) => {
//       event?.preventDefault();

//       const path = makeComponentUrl(id);
//       return history.push(path);
//     },
//     [history]
//   );
//   return (
//     <div {...rest} className={styles.sidebar}>
//       <OverviewLink />
//       <div className={styles.inputWrapper}>
//         <Input placeholder="Search" error={false} className={styles.input} />
//         <Icon of="discovery" className={styles.searchIcon} />
//       </div>
//       <ComponentTree selected={selected} onSelect={handleSelect} components={componentsData} />
//     </div>
//   );
// }

// // @TODO - move this to router extension
// function makeComponentUrl(id: string) {
//   return `/${id}${getStickyUrl()}`;
// }

// function getStickyUrl() {
//   if (typeof window === 'undefined') return '';

//   const [, section] = window.location.pathname.split('~');

//   return section ? `/~${section}` : '';
// }
