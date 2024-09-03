import React from 'react';
import { Link as BaseLink } from '@teambit/design.ui.navigation.link';
import styles from './login.module.scss';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link for @teambit/design.ui.navigation.link
const Link = BaseLink as any;

export type LoginProps = {
  loginText?: string;
  loginUrl?: string;
};

export function Login({ loginText = 'Login', loginUrl }: LoginProps) {
  if (!loginUrl) return null;

  return (
    <div className={styles.login}>
      <Link external className={styles.text} href={loginUrl}>
        {loginText}
      </Link>
    </div>
  );
}
