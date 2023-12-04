import React from 'react';
import { CircleSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { useCurrentUser } from '@teambit/cloud.hooks.use-current-user';
import { useLogout } from '@teambit/cloud.hooks.use-logout';
import { useNavigate, Link } from '@teambit/base-react.navigation.link';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import styles from './current-user.module.scss';

export type CurrentUserProps = {};

export function CurrentUser() {
  const { currentUser, loginUrl, isLoggedIn, loading } = useCurrentUser();
  const { logout, loading: loadingLoggingOut, loggedOut } = useLogout();
  const [open, setOpen] = React.useState<boolean | undefined>(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (loggedOut) {
      navigate(0);
    }
  }, [loggedOut]);

  const onUserClicked = React.useCallback(() => {
    if (!currentUser) return;
    window.open(`https://bit.cloud/${currentUser.username}`, '_blank');
  }, [currentUser?.username]);

  if (loading || loadingLoggingOut) {
    return <CircleSkeleton className={styles.loader} />;
  }
  if (!currentUser) return null;
  if (!isLoggedIn || loggedOut) {
    return (
      <Link href={loginUrl} external={true}>
        Login
      </Link>
    );
  }

  return (
    <Dropdown
      open={open}
      dropClass={styles.dropdown}
      placeholder={
        <div className={styles.currentUser}>
          <UserAvatar size={32} account={currentUser} />
        </div>
      }
      clickPlaceholderToggles={true}
      onPlaceholderToggle={() => setOpen((o) => !o)}
      clickOutside={true}
      position="bottom-end"
      clickToggles={false}
      onClickOutside={() => {
        setOpen(false);
      }}
    >
      <div className={styles.dropdownMenu}>
        <div className={styles.user} onClick={onUserClicked}>
          <UserAvatar size={24} account={currentUser} />
          <div className={styles.userDetails}>
            <div className={styles.displayName}>{currentUser.displayName || currentUser.username}</div>
            <div className={styles.username}>@{currentUser.username}</div>
          </div>
        </div>
        <div
          className={styles.logout}
          onClick={() => {
            logout?.();
          }}
        >
          Logout
        </div>
      </div>
    </Dropdown>
  );
}
