import { expect } from 'chai';
import { SlotRegistry } from '@teambit/harmony';
import type { ComponentUI } from '@teambit/component';
import { CommandBarAspect } from './command-bar.aspect';
import { CommandBarUI } from './command-bar.ui.runtime';
import { commandBarCommands } from './command-bar.commands';
import type { CommandEntry } from './command-bar.ui.runtime';
import type { SearchProvider } from './searchers';

function createProvider(componentUI?: Partial<ComponentUI>) {
  // harmony keys slot entries by the aspect whose provider is running
  const searcherSlot = new SlotRegistry<SearchProvider[]>(() => CommandBarAspect.id);
  const commandSlot = new SlotRegistry<CommandEntry[]>(() => CommandBarAspect.id);
  return CommandBarUI.provider([undefined, undefined, componentUI as ComponentUI], {}, [
    searcherSlot,
    commandSlot,
  ]).then((commandBar) => ({ commandBar, searcherSlot, commandSlot }));
}

describe('CommandBarUI provider', () => {
  const componentSearcher: SearchProvider = { test: () => true, search: () => ({ items: [] }) };
  let componentActionCalled = false;
  const componentUI: Partial<ComponentUI> = {
    isCommandBarEnabled: true,
    keyBindings: [
      { id: 'component.copyBitId', action: () => (componentActionCalled = true), displayName: 'Copy component ID' },
    ],
    componentSearcher: componentSearcher as unknown as ComponentUI['componentSearcher'],
    registerCommandRunner: () => {},
    registerRightSideMenuItem: () => {},
  };

  it('keeps the open command when component commands are registered', async () => {
    const { commandBar } = await createProvider(componentUI);
    // `open` returns false (prevent default); undefined means the command is missing
    expect(commandBar.run(commandBarCommands.open)).to.equal(false);
    commandBar.run('component.copyBitId');
    expect(componentActionCalled).to.be.true;
  });

  it('keeps the command searcher first, followed by the component searcher', async () => {
    const { searcherSlot } = await createProvider(componentUI);
    const searchers = searcherSlot.values().flat();
    expect(searchers).to.have.lengthOf(2);
    expect(searchers[1]).to.equal(componentSearcher);
  });

  it('registers only its own command and searcher when the component command bar is disabled', async () => {
    const { commandBar, searcherSlot } = await createProvider({ ...componentUI, isCommandBarEnabled: false });
    expect(commandBar.run(commandBarCommands.open)).to.equal(false);
    expect(searcherSlot.values().flat()).to.have.lengthOf(1);
  });
});
