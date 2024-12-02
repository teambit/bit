import React from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { CircleSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { useNavigate } from '@teambit/design.ui.navigation.link';
import { Login } from '@teambit/cloud.ui.login';
import { CurrentUser } from '@teambit/cloud.ui.current-user';
import { useCurrentUser } from '@teambit/cloud.hooks.use-current-user';
import { useLogout } from '@teambit/cloud.hooks.use-logout';
import { Menu, MenuItemType } from '@teambit/design.controls.menu';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { UserBarSection } from './section';
import { UserBarItem } from './item';

import styles from './user-bar.module.scss';

export type UserBarProps = {
  /**
   * sections to render in the user bar.
   */
  sections?: UserBarSection[];

  /**
   * items in the user bar.
   */
  items?: UserBarItem[];
};

export function UserBar({ sections = [], items = [] }: UserBarProps) {
  const { isMinimal } = useWorkspaceMode();
  const { currentUser, loginUrl, loading, isLoggedIn } = useCurrentUser();
  const { logout, loading: loadingLoggingOut, loggedOut } = useLogout();

  const navigate = useNavigate();

  if (isMinimal) return null;

  if (loading || loadingLoggingOut) {
    return <CircleSkeleton className={styles.loader} />;
  }

  if (!currentUser || !isLoggedIn || loggedOut) {
    return <Login loginUrl={loginUrl} />;
  }

  const itemList: MenuItemType[] = items
    .filter((item) => !item.category)
    .map(({ component: Component, href, ...rest }, index) => {
      return {
        ...rest,
        link: href,
        component: Component ? <Component key={`user-bar-item-${index}`} user={currentUser} /> : undefined,
      };
    });

  const sectionList: MenuItemType[] = sections.map((section) => {
    const children = items?.filter((item) => item.category === section.categoryName);
    if (!children || children.length === 0) return {};

    return {
      category: section.displayName,
      label: section.displayName,
      children: children?.map(({ component: Component, href, ...rest }, index) => {
        return {
          ...rest,
          link: href,
          component: Component ? <Component key={index} user={currentUser} /> : undefined,
        };
      }),
    };
  });

  const logoutItem: MenuItemType = {
    label: 'logout',
    children: [
      {
        label: 'Logout',
        icon: 'logout',
        onClick: () => {
          logout?.()
            .then(() => {
              navigate(0);
            })
            .catch((e) => {
              // eslint-disable-next-line no-console
              console.error(`Failed to logout: ${e}`);
            });
        },
      },
    ],
  };

  const userDetails: MenuItemType = {
    label: '',
    component: (
      <CurrentUser
        className={styles.currentUser}
        currentUser={currentUser}
        handleClick={() => {
          window.open(`https://bit.cloud/${currentUser.username}`, '_blank');
        }}
      />
    ),
  };

  const allItems = [userDetails, ...itemList, ...sectionList, logoutItem];

  return (
    <Menu
      offsetY={10}
      position="anchor"
      align="end"
      onItemClick={(e) => {
        if (!e.value.link) return undefined;
        if (e.value.link.startsWith('http')) return window.open(e.value.link, '_blank');
        return navigate(e.value.link);
      }}
      menuButton={
        <div className={styles.currentUser}>
          <UserAvatar account={currentUser} size={32} />
        </div>
      }
      items={allItems}
    />
  );
}
