import type { PreloadBridge } from '@aipad/terminal-host';
import { TabStrip } from './tab-strip.js';
import { Sidebar } from './sidebar.js';
import { LayoutManager } from './layout-manager.js';
import { wireKeyboard, routeMenuAction } from './keyboard.js';
import { IpcChannel } from '@aipad/contracts';

const bridge = (window as unknown as { aipad: PreloadBridge }).aipad;

const tabStripEl = document.getElementById('tab-strip')!;
const sidebarListEl = document.getElementById('sidebar-list')!;
const sidebarToggleEl = document.getElementById('sidebar-toggle')!;
const bodyEl = document.getElementById('body')!;

const manager = new LayoutManager({
  bridge,
  bodyEl,
  tabStrip: new TabStrip(tabStripEl, {
    onTabClick: (id) => manager.focus(id),
    onTabClose: (id) => void manager.closeTab(id),
    onNewTab: () => void manager.newTab(),
    onTabReorder: (id, before) => manager.reorderTab(id, before),
  }),
  sidebar: new Sidebar({
    listEl: sidebarListEl,
    toggleEl: sidebarToggleEl,
    callbacks: {
      onRowClick: (id) => manager.focus(id),
      onToggle: () => manager.toggleSidebar(),
      onRename: (id) => void manager.renameTab(id),
      onDuplicate: (id) => void manager.duplicateTab(id),
      onRestart: (id) => void manager.restartTab(id),
      onClose: (id) => void manager.closeTab(id),
      onResumeCancel: (id) => manager.cancelResume(id),
    },
  }),
});

void manager.start();

// Expose for keyboard handler (T14).
(window as unknown as { __aipadLayout: LayoutManager }).__aipadLayout = manager;

bridge.on(IpcChannel.ActionInvoke, (raw) => {
  const { action } = raw as { action: string };
  routeMenuAction(manager, action);
});

wireKeyboard(manager);

console.info('[chrome] mounted');
