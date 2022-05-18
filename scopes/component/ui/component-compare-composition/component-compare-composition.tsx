import classNames from "classnames";
import React from "react";
import styles from "./component-compare-composition.module.scss";

export function ComponentCompareComposition() {
    return (
        <div className={styles.mainContainer}>
            <div className={styles.subContainer}>
                <div className={classNames([styles.subView, styles.leftView])}>
                    <h1>Hello Component Composition Compare</h1>
                </div>
            </div>
            <div className={styles.subContainer}>
                <div className={classNames([styles.subView, styles.rightView])}>
                    <h1>Hello Component Composition Compare</h1>
                </div>
            </div>
        </div>
    );
}