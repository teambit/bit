import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { flatten } from 'lodash';
import { SubMenu } from '@teambit/design.controls.menu';
import { Slot } from '@teambit/harmony';
import { UserBar, UserBarItem, UserBarItemSlot, UserBarSection, UserBarSectionSlot } from '@teambit/cloud.ui.user-bar';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { CloudAspect } from './cloud.aspect';

export class CloudUI {
  constructor(private userBarSectionSlot: UserBarSectionSlot, private userBarItemSlot: UserBarItemSlot) {}
  /**
   * register a new user bar item.
   */
  registerUserBarItem(userBarItem: UserBarItem[]) {
    this.userBarItemSlot.register(userBarItem);
    return this;
  }

  /**
   * register a new user bar section
   */
  registerUserBarSection(sections: UserBarSection[]) {
    this.userBarSectionSlot.register(sections);
    return this;
  }

  /**
   * list user bar items.
   */
  listUserBarItems() {
    return flatten(this.userBarItemSlot.values());
  }

  /**
   * list all user bar sections.
   */
  listUserBarSections() {
    return flatten(this.userBarSectionSlot.values());
  }

  static runtime = UIRuntime;

  static dependencies = [WorkspaceAspect];

  static slots = [Slot.withType<UserBarItem[]>(), Slot.withType<UserBarSection[]>()];

  static async provider(
    [workspace]: [WorkspaceUI],
    _,
    [userBarItemSlot, userBarSectionSlot]: [UserBarItemSlot, UserBarSectionSlot]
  ) {
    const cloudUI = new CloudUI(userBarSectionSlot, userBarItemSlot);

    cloudUI.registerUserBarSection([
      {
        displayName: 'Scopes & Components',
        categoryName: 'ScopesAndComponents',
      },
      {
        displayName: 'Docs, Support & Feedback',
        categoryName: 'DocsSupportAndFeedback',
      },
    ]);
    cloudUI.registerUserBarItem([
      {
        icon: 'settings',
        label: 'Settings',
        href: 'https://bit.cloud/settings',
      },
      {
        category: 'ScopesAndComponents',
        icon: 'components',
        label: 'Your components',
        href: 'https://bit.cloud/components',
      },
      {
        category: 'ScopesAndComponents',
        icon: 'collection',
        label: 'Your scopes',
        href: 'https://bit.cloud/scopes',
      },
      {
        category: 'DocsSupportAndFeedback',
        icon: 'book-glossary',
        label: 'Bit Docs',
        href: 'https://bit.dev/docs',
      },
      {
        category: 'DocsSupportAndFeedback',
        component: function Support() {
          return (
            <SubMenu
              item={{
                label: 'Support',
                icon: 'users',
                children: [
                  {
                    label: 'Bit Community on bit.cloud',
                    link: 'https://bit.cloud/bitdev',
                  },
                  {
                    label: 'Ticket Support',
                    link: 'https://support.bit.cloud',
                  },
                  {
                    label: 'Bit Community Slack',
                    link: 'https://join.slack.com/t/bit-dev-community/shared_invite/zt-29pmawrp1-ehfEzYbQyuAC3CNA_jYPvA',
                  },
                ],
              }}
            />
          );
        },
      },
    ]);
    const userBarItems = cloudUI.listUserBarItems();
    const userBarSections = cloudUI.listUserBarSections();
    const CloudUserBar = () => <UserBar sections={userBarSections} items={userBarItems} />;
    workspace.registerMenuWidget([CloudUserBar]);
    return cloudUI;
  }
}

export default CloudUI;

CloudAspect.addRuntime(CloudUI);
