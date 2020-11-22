import React from 'react';
import { useRouting } from './routing-provider';

export const useLink = () => {
  const { Link, useLocation } = useRouting();
  const { pathname } = useLocation();

  return <Link href={pathname}>go to {pathname}</Link>;
};

export const activeNavLink = () => {
  const { NavLink, useLocation } = useRouting();
  const { pathname } = useLocation();

  return (
    <NavLink href={pathname} activeStyle={{ background: 'lightblue', borderRadius: 5, padding: 4 }}>
      active link
    </NavLink>
  );
};

export const inactiveNavLink = () => {
  const { NavLink } = useRouting();

  return (
    <NavLink href="https://tib.ved" activeStyle={{ background: 'lightblue', borderRadius: 5, padding: 4 }}>
      inactive NavLink
    </NavLink>
  );
};
