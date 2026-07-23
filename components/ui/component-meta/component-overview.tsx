import React, { useMemo } from 'react';
import classNames from 'classnames';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { textColumn } from '@teambit/base-ui.layout.page-frame';
import { H1 } from '@teambit/documenter.ui.heading';
import { LabelList } from '@teambit/documenter.ui.label-list';
import { Section, type SectionProps } from '@teambit/documenter.ui.section';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { snapToSemver } from '@teambit/component-package-version';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { Separator } from '@teambit/design.ui.separator';
import { ContentTabs } from '@teambit/design.navigation.content-tabs';
import type { ContentTab } from '@teambit/design.navigation.content-tabs';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import { Row } from '@teambit/base-react.layout.row';
import { Icon } from '@teambit/evangelist.elements.icon';
import type { ComponentModel } from '@teambit/component';
import { BadgePosition } from '@teambit/docs';
import type { TitleBadge } from '@teambit/docs';
import { Tooltip } from '@teambit/design.ui.tooltip';

import styles from './component-overview.module.scss';

export type ComponentOverviewProps = {
  displayName: string;
  abstract?: string;
  labels: string[];
  packageName: string;
  elementsUrl?: string;
  titleBadges?: TitleBadge[];
  componentDescriptor?: ComponentDescriptor;
  component?: ComponentModel;
  pkgManager?: 'npm' | 'yarn' | 'pnpm' | 'bit';
} & SectionProps;

export function ComponentOverview({
  displayName,
  abstract,
  titleBadges,
  labels,
  packageName,
  elementsUrl,
  componentDescriptor,
  component,
  pkgManager = 'npm',
  ...rest
}: ComponentOverviewProps) {
  const host = component?.host;
  const isWorkspace = host === 'teambit.workspace/workspace';

  const packageNameTabTitle = isWorkspace ? `Use package` : `Install package`;
  const componentId = component?.id;
  const componentIdVersion = componentId?.version ?? undefined;
  const latestVersion = component?.latest ?? undefined;
  const packageVersion = componentIdVersion === latestVersion ? '' : `@${snapToSemver(componentIdVersion as string)}`;

  const [selectedPkgManager, setSelectedPkgManager] = React.useState(pkgManager);

  const installCmd = useMemo(() => {
    if (selectedPkgManager === 'yarn') return 'add';
    if (selectedPkgManager === 'bit') return 'install';
    return 'i';
  }, [selectedPkgManager]);

  const copyTextInstall = useMemo(
    () => `${selectedPkgManager} ${installCmd} ${packageName}${packageVersion}`,
    [selectedPkgManager, packageName, packageVersion, installCmd]
  );

  const copyTextImport = `bit import ${componentId?.toStringWithoutVersion() ?? ''}`;

  const tooltipContent = useMemo(() => `Copy ${selectedPkgManager} install command`, [selectedPkgManager]);

  const SelectedPkgManagerPlaceholder = useMemo(() => {
    switch (selectedPkgManager) {
      case 'npm':
        return <img alt="npm-logo" className={styles.npm} src="https://static.bit.dev/brands/logo-npm-new.svg" />;
      case 'pnpm':
        return <img alt="pnpm-logo" className={styles.pnpm} src="https://static.bit.dev/brands/pnpm.svg" />;
      case 'yarn':
        return <img alt="yarn-logo" className={styles.yarn} src="https://static.bit.dev/brands/logo-yarn-text.svg" />;
      case 'bit':
        return <Icon className={styles.bit} of="bit-logo-mono" />;
      default:
        return null;
    }
  }, [selectedPkgManager]);

  const tabsComponentId: ContentTab[] = [
    {
      component: function TabPackageName() {
        return <span>{packageNameTabTitle}</span>;
      },
      content: isWorkspace ? (
        <CopyBox className={styles.copyBox}>{packageName}</CopyBox>
      ) : (
        <CopyBox
          className={styles.copyBox}
          copyText={copyTextInstall}
          Tooltip={({ children }) => (
            <Tooltip placement="right" content={tooltipContent}>
              {children}
            </Tooltip>
          )}
          CopyIcon={
            <Tooltip content={tooltipContent}>
              <Icon className={styles.copyIcon} of="copy-cmp" />
            </Tooltip>
          }
          CopyWidget={
            <div className={styles.copyContainer}>
              <Dropdown
                className={styles.pkgManagerDropdown}
                dropClass={styles.pkgManagerMenu}
                placeholder={
                  <div className={styles.pkgManagerPlaceholder}>
                    {SelectedPkgManagerPlaceholder}
                    <Icon of="fat-arrow-down" />
                  </div>
                }
                clickOutside
                clickPlaceholderToggles
                position="bottom-start"
                clickToggles
              >
                <div className={styles.pkgManagerMenuItems}>
                  <div
                    className={classNames(selectedPkgManager === 'npm' && styles.selected)}
                    onClick={() => setSelectedPkgManager('npm')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPkgManager('npm')}
                    aria-label="Select npm package manager"
                  >
                    <img alt="npm-logo" className={styles.npm} src="https://static.bit.dev/brands/logo-npm-new.svg" />
                  </div>
                  <div
                    className={classNames(selectedPkgManager === 'pnpm' && styles.selected)}
                    onClick={() => setSelectedPkgManager('pnpm')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPkgManager('pnpm')}
                    aria-label="Select pnpm package manager"
                  >
                    <img alt="pnpm-logo" className={styles.pnpm} src="https://static.bit.dev/brands/pnpm.svg" />
                  </div>
                  <div
                    className={classNames(selectedPkgManager === 'yarn' && styles.selected)}
                    onClick={() => setSelectedPkgManager('yarn')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPkgManager('yarn')}
                    aria-label="Select yarn package manager"
                  >
                    <img
                      alt="yarn-logo"
                      className={styles.yarn}
                      src="https://static.bit.dev/brands/logo-yarn-text.svg"
                    />
                  </div>
                  <div
                    className={classNames(selectedPkgManager === 'bit' && styles.selected)}
                    onClick={() => setSelectedPkgManager('bit')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPkgManager('bit')}
                    aria-label="Select bit package manager"
                  >
                    <Icon className={styles.bit} of="bit-logo-mono" />
                  </div>
                </div>
              </Dropdown>
            </div>
          }
        >
          {packageName}
        </CopyBox>
      ),
    },
    {
      component: function TabComponentID() {
        return <span>Modify component</span>;
      },
      content: isWorkspace ? (
        <CopyBox className={styles.copyBox}>{componentId ? componentId.toStringWithoutVersion() : ''}</CopyBox>
      ) : (
        <CopyBox
          className={styles.copyBox}
          copyText={copyTextImport}
          Tooltip={({ children }) => (
            <Tooltip placement="right" content="copy bit import command">
              {children}
            </Tooltip>
          )}
          CopyIcon={
            <div className={styles.copyContainer}>
              <div>
                <Icon className={styles.bit} of="bit-logo-mono" />
              </div>
              <div>
                <Icon className={styles.copyIcon} of="copy-cmp" />
              </div>
            </div>
          }
        >
          {componentId ? componentId.toStringWithoutVersion() : ''}
        </CopyBox>
      ),
    },
  ];

  let finalElementsUrl = elementsUrl;
  if (finalElementsUrl && !finalElementsUrl.startsWith('http')) {
    const origin = isBrowser ? window.location.origin : undefined;
    finalElementsUrl = origin && elementsUrl ? `${origin}${elementsUrl}` : undefined;
    if (finalElementsUrl) {
      tabsComponentId.push({
        component: function TabElementUrl() {
          return <span>Elements url</span>;
        },
        content: <CopyBox className={styles.copyBox}>{finalElementsUrl}</CopyBox>,
      });
    }
  }

  return (
    <Section {...rest}>
      <div className={textColumn}>
        <Row className={styles.titleRow}>
          <div className={styles.componentTitle}>
            <H1 className={styles.title}>{displayName}</H1>
          </div>
          <BadgeSection
            position={BadgePosition.Title}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
        <Row>
          {abstract && (
            <>
              <Subtitle className={styles.subTitle}>{abstract}</Subtitle>
              <BadgeSection
                position={BadgePosition.SubTitle}
                componentDescriptor={componentDescriptor}
                component={component}
                badges={titleBadges}
              />
            </>
          )}
        </Row>
        <Row>
          <LabelList>{labels}</LabelList>
          <BadgeSection
            position={BadgePosition.Labels}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
        <Row>
          <div className={styles.contentTabs}>
            <ContentTabs priority="folder" tabs={tabsComponentId} navClassName={styles.nav} tabClassName={styles.tab} />
          </div>
          <BadgeSection
            position={BadgePosition.Package}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
      </div>
      <Separator isPresentational />
    </Section>
  );
}

export type BadgeSectionProps = {
  badges: TitleBadge[] | undefined;
  position: BadgePosition;
  componentDescriptor?: ComponentDescriptor;
  component?: ComponentModel;
};
export function BadgeSection({ badges, position, componentDescriptor, component }: BadgeSectionProps) {
  return (
    <div className={styles.badgeContainer}>
      {badges
        // eslint-disable-next-line react/prop-types
        ?.filter((badge) => {
          return (
            (position === BadgePosition.Title && !badge.position) || // default position is title
            badge.position === position
          );
        })
        ?.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
        ?.map((titleBadge, index) => {
          return (
            <titleBadge.component
              key={index}
              componentDescriptor={componentDescriptor}
              legacyComponentModel={component}
            />
          );
        })}
    </div>
  );
}
