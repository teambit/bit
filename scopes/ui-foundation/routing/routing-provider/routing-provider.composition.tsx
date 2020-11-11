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

	return <NavLink href={pathname}>dynamic link</NavLink>;
};

export const inactiveNavLink = () => {
	const { NavLink } = useRouting();

	return <NavLink href="https://tib.ved">inactive NavLink</NavLink>;
};
