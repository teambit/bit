import React, { ReactNode, useState } from 'react';
import copy from 'copy-to-clipboard';
import classNames from 'classnames';
import { CopiedMessage } from '@teambit/documenter.ui.copied-message';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Grid } from '@teambit/base-ui.layout.grid-component';
import styles from './copy-box.module.scss';

export type CopyBoxProps = {
  /**
   * specify the link to be copied to your clipboard
   */
  children: string;
  copyText?: string;
  CopyWidget?: ReactNode;
  CopyIcon?: ReactNode;
  Tooltip?: React.ComponentType<{ children: ReactNode }>;
} & React.HTMLAttributes<HTMLDivElement>; // TODO - export GridProps in '@teambit/base-ui.layout.grid-component' and place here

/**
 *  A UI component that allows copying a link to the clipboard
 */
export function CopyBox({
  children,
  copyText = children,
  CopyWidget,
  CopyIcon = <Icon className={styles.copyIcon} of="copy-cmp" />,
  className,
  Tooltip: TooltipFromProps = ({ children: c }) => <>{c}</>,
  ...rest
}: CopyBoxProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleClick = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    copy(copyText);
  };

  return (
    <Grid colMd={2} className={classNames(styles.copyBox, className)} {...rest}>
      <div className={styles.leftSection}>{children}</div>
      <div className={styles.rightSection}>
        {CopyWidget}
        <CopiedMessage show={isCopied} />
        <TooltipFromProps>
          <button type="button" className={styles.button} onClick={handleClick}>
            {CopyIcon}
          </button>
        </TooltipFromProps>
      </div>
    </Grid>
  );
}
