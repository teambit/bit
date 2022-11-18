import React from 'react';
import classNames from 'classnames';
import { Grid, GridProps } from '@teambit/base-ui.layout.grid-component';
import { TableColumn } from '@teambit/documenter.ui.table-column';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/default-highlight';
import xcode from 'react-syntax-highlighter/dist/esm/styles/hljs/xcode';

import styles from './table-row.module.scss';

export type DefaultValueProp = {
  value: string;
  computed?: boolean;
  __typename?: string;
};

export type RowType = {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: DefaultValueProp;
  [key: string]: string | any;
};

export type CustomRowType = {
  [K in keyof RowType]?: JSX.Element;
};

export type ColNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; // TODO - export Grid ColProps and use here

export type TableRowProps = {
  /**
   * the number of columns to show in the row
   */
  colNumber: ColNumber;
  /**
   * the data to be shown in the row
   */
  row: RowType;
  /**
   * custom renderer for the data in the row
   */
  customRow?: CustomRowType;
  /**
   * the heading row, by which the row data is ordered
   */
  headings: string[];
  /**
   * display mobile styles
   */
  isListView?: boolean;
} & GridProps;

/**
 *
 * Renders a row in the table according to the order of the headings.
 */
export function TableRow({ row, customRow, colNumber = 4, headings, isListView, className, ...rest }: TableRowProps) {
  return (
    <Grid
      col={colNumber}
      className={classNames(
        styles.propRow,
        {
          [styles.singleColumn]: isListView,
        },
        className
      )}
      {...rest}
    >
      {headings.map((title, index) => {
        if (title === 'required') return null;
        if (title === 'name') {
          return (
            <TableColumn className={styles.breakWord} key={index}>
              <div
                className={classNames(styles.mobileTitle, {
                  [styles.show]: isListView,
                })}
              >
                {title}
              </div>
              <div className={styles.columnContent}>
                <div className={styles.name}>{customRow?.name || row[title]}</div>
                {!customRow?.required && row.required && <div className={styles.required}>(Required)</div>}
                {customRow?.required && <div className={styles.required}>{customRow.required}</div>}
              </div>
            </TableColumn>
          );
        }
        if (title === 'type') {
          return (
            <TableColumn className={classNames(styles.breakWord, styles.typeColumn)} key={index}>
              <div
                className={classNames(styles.mobileTitle, {
                  [styles.show]: isListView,
                })}
              >
                {title}
              </div>
              {!customRow?.type && (
                <SyntaxHighlighter theme={xcode} language="javascript" className={styles.highlighted}>
                  {row[title]}
                </SyntaxHighlighter>
              )}
              {customRow?.type}
            </TableColumn>
          );
        }
        if (title === 'default') {
          return (
            <TableColumn className={styles.breakWord} key={index}>
              <div
                className={classNames(styles.mobileTitle, {
                  [styles.show]: isListView,
                })}
              >
                {title}
              </div>
              {!customRow?.default && (
                <span className={styles.default}>{(row[title] && row[title]?.value) || '-'}</span>
              )}
              {customRow?.default && <span className={styles.default}>{customRow.default}</span>}
            </TableColumn>
          );
        }
        if (title === 'description') {
          return (
            <TableColumn className={styles.breakWord} key={index}>
              {customRow?.description || row[title]}
            </TableColumn>
          );
        }
        // default
        return (
          <TableColumn className={styles.breakWord} key={index}>
            <div
              className={classNames(styles.mobileTitle, {
                [styles.show]: isListView,
              })}
            >
              {title}
            </div>
            {customRow?.[title] || row[title]}
          </TableColumn>
        );
      })}
    </Grid>
  );
}
