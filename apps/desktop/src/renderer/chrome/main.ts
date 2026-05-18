import type { PreloadBridge } from '@aipad/terminal-host';
import { TabStrip } from './tab-strip.js';
import { Sidebar } from './sidebar.js';
import { LayoutManager } from './layout-manager.js';

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
  }),
  sidebar: new Sidebar({
    listEl: sidebarListEl,
    toggleEl: sidebarToggleEl,
    callbacks: {
      onRowClick: (id) => manager.focus(id),
      onToggle: () => manager.toggleSidebar(),
    },
  }),
});

void manager.start();

// Expose for keyboard handler (T14).
(window as unknown as { __aipadLayout: LayoutManager }).__aipadLayout = manager;

console.info('[chrome] mounted');
