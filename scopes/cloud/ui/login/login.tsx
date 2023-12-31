import React from 'react';
import { Link } from '@teambit/design.ui.navigation.link';
import styles from './login.module.scss';

export type LoginProps = {
  loginText?: string;
  loginUrl?: string;
};

export function Login({ loginText = 'Login', loginUrl }: LoginProps) {
  if (!loginUrl) return null;

  return (
    <div className={styles.login}>
      <Link className={styles.text} href={loginUrl}>
        {loginText}
      </Link>
    </div>
  );
}
