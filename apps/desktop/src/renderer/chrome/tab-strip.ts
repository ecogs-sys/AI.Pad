import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface TabViewModel {
  info: SessionInfo;
  attention: boolean;
}

export interface TabStripCallbacks {
  onTabClick: (sessionId: SessionId) => void;
  onTabClose: (sessionId: SessionId) => void;
  onNewTab: () => void;
  onTabReorder: (sessionId: SessionId, beforeId: SessionId | null) => void;
}

export class TabStrip {
  private readonly root: HTMLElement;
  private readonly callbacks: TabStripCallbacks;

  constructor(root: HTMLElement, callbacks: TabStripCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
  }

  render(tabs: TabViewModel[], focusedId: SessionId | null): void {
    this.root.innerHTML = '';
    for (const tab of tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.info.id === focusedId ? ' active' : '');
      el.dataset['sessionId'] = tab.info.id;

      const dot = document.createElement('span');
      dot.className = 'dot ' + (tab.attention
        ? 'attention'
        : tab.info.status === 'running'
          ? 'running'
          : tab.info.status === 'exited'
            ? 'exited'
            : '');
      el.appendChild(dot);

      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = tab.info.title || tab.info.shell;
      el.appendChild(title);

      const close = document.createElement('span');
      close.className = 'close';
      close.textContent = '×';
      close.title = 'Close tab (Ctrl+W)';
      close.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.callbacks.onTabClose(tab.info.id);
      });
      el.appendChild(close);

      el.addEventListener('click', () => this.callbacks.onTabClick(tab.info.id));

      el.draggable = true;
      el.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('text/plain', tab.info.id);
      });
      el.addEventListener('dragover', (ev) => ev.preventDefault());
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const draggedId = ev.dataTransfer?.getData('text/plain') as SessionId | undefined;
        if (!draggedId || draggedId === tab.info.id) return;
        this.callbacks.onTabReorder(draggedId, tab.info.id);
      });

      this.root.appendChild(el);
    }

    const plus = document.createElement('button');
    plus.id = 'new-tab';
    plus.textContent = '+';
    plus.title = 'New tab (Ctrl+T)';
    plus.addEventListener('click', () => this.callbacks.onNewTab());
    this.root.appendChild(plus);
  }
}
