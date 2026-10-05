import type { ComponentType } from 'react';
import React from 'react';
import { UIRuntime } from '@teambit/harmony.modules.runtimes';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ComponentModel, ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { CompareTests } from '@teambit/defender.ui.test-compare';
import type { ComponentCompareUI } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { TestCompareSection } from '@teambit/defender.ui.test-compare-section';
import { gql, useQuery } from '@apollo/client';
import { PillLabel } from '@teambit/design.ui.pill-label';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Link, useLocation } from '@teambit/base-react.navigation.link';
import { TestsSection } from './tests.section';
import { TesterAspect } from './tester.aspect';
import styles from './coverage-label.module.scss';

const GET_COMPONENT = gql`
  query ($id: String!) {
    getHost {
      id # for GQL caching
      getTests(id: $id) {
        loading
        testsResults {
          coverage {
            total {
              lines {
                covered
                total
                pct
              }
            }
          }
        }
      }
    }
  }
`;

export type EmptyStateSlot = SlotRegistry<ComponentType>;

function CoverageBadge({ legacyComponentModel }: { legacyComponentModel: ComponentModel }) {
  const location = useLocation();
  const search = location?.search ?? '';

  const { data } = useQuery(GET_COMPONENT, {
    variables: { id: legacyComponentModel.id.toString() },
  });

  if (!data || !data.getHost || !data.getHost.getTests) return null;

  const total = data.getHost.getTests.testsResults?.coverage?.total as
    | {
        lines?: {
          covered: number;
          total: number;
          pct: number;
        };
      }
    | undefined;

  if (!total || !total.lines) return null;

  return (
    <Tooltip
      className={styles.coverageTooltip}
      placement="top"
      content={<div className={styles.coverageTooltipContent}>Test coverage</div>}
    >
      <Link href={`~tests${search}`} className={styles.link}>
        <PillLabel className={styles.label}>
          <Icon of="scan-component" />
          <span>{total.lines.pct}%</span>
        </PillLabel>
      </Link>
    </Tooltip>
  );
}

export class TesterUI {
  static dependencies = [ComponentAspect, ComponentCompareAspect];

  static runtime = UIRuntime;

  stageKey?: string;

  constructor(
    private component: ComponentUI,
    private emptyStateSlot: EmptyStateSlot
  ) {}

  /**
   * register a new tester empty state. this allows to register a different empty state from each environment for example.
   */
  registerEmptyState(emptyStateComponent: ComponentType) {
    this.emptyStateSlot.register(emptyStateComponent);
    return this;
  }

  /**
   * the test coverage badge of the component overview's title. the docs aspect registers it, so the
   * tester doesn't depend on docs (that dependency closes a circular dependency).
   */
  readonly coverageBadge = { component: CoverageBadge, weight: 30 };

  getTesterCompare() {
    return <CompareTests emptyState={this.emptyStateSlot} />;
  }

  static slots = [Slot.withType<ComponentType>()];

  static async provider(
    [component, componentCompare]: [ComponentUI, ComponentCompareUI],
    config,
    [emptyStateSlot]: [EmptyStateSlot]
  ) {
    const testerUi = new TesterUI(component, emptyStateSlot);
    const section = new TestsSection(emptyStateSlot);
    const testerCompareSection = new TestCompareSection(testerUi);
    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation(testerCompareSection);
    componentCompare.registerRoutes([testerCompareSection.route]);
    return testerUi;
  }
}

export default TesterUI;

TesterAspect.addRuntime(TesterUI);
