import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface SidebarRowVm {
  info: SessionInfo;
  attention: boolean;
  /** Time the session entered its current status, in epoch ms. */
  statusSinceMs: number;
  /** Epoch ms a pending auto-resume will fire, or null when none is scheduled. */
  resumeAt: number | null;
}

export interface SidebarCallbacks {
  onRowClick: (sessionId: SessionId) => void;
  onToggle: () => void;
  /** Opens the rename modal; the LayoutManager owns the dialog + IPC. */
  onRename: (sessionId: SessionId) => void;
  onDuplicate: (sessionId: SessionId) => void;
  /** Restart an exited tab (fresh shell) or a crashed tab (fresh renderer). */
  onRestart: (sessionId: SessionId) => void;
  onClose: (sessionId: SessionId) => void;
  /** Cancel a pending auto-resume for the session. */
  onResumeCancel: (sessionId: SessionId) => void;
}

const SHELL_ICONS: Record<string, string> = {
  pwsh: 'PS',
  powershell: 'PS',
  cmd: 'CM',
  bash: 'BA',
  zsh: 'ZS',
  wsl: 'WSL',
};

export class Sidebar {
  private readonly listEl: HTMLElement;
  private readonly toggleEl: HTMLElement;
  private readonly callbacks: SidebarCallbacks;

  constructor(opts: {
    listEl: HTMLElement;
    toggleEl: HTMLElement;
    callbacks: SidebarCallbacks;
  }) {
    this.listEl = opts.listEl;
    this.toggleEl = opts.toggleEl;
    this.callbacks = opts.callbacks;
    this.toggleEl.addEventListener('click', () => this.callbacks.onToggle());
  }

  render(rows: SidebarRowVm[], focusedId: SessionId | null): void {
    this.listEl.innerHTML = '';
    const now = Date.now();
    for (const row of rows) {
      const el = document.createElement('div');
      el.className =
        'sidebar-row' +
        (row.info.id === focusedId ? ' active' : '') +
        (row.attention ? ' attention' : '');
      el.dataset['sessionId'] = row.info.id;

      // Header row: icon tile + title
      const head = document.createElement('div');
      head.className = 'sr-head';

      const iconTile = document.createElement('div');
      iconTile.className = 'sr-icon';
      iconTile.textContent = SHELL_ICONS[row.info.shell] ?? '??';
      const cornerStatus = this.cornerDotClass(row);
      if (cornerStatus) {
        const dot = document.createElement('span');
        dot.className = `sr-icon-dot ${cornerStatus}`;
        iconTile.appendChild(dot);
      }
      head.appendChild(iconTile);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'sr-title title-text';
      titleSpan.textContent = row.info.title || row.info.shell;
      head.appendChild(titleSpan);

      el.appendChild(head);

      // cwd line
      const cwd = document.createElement('div');
      cwd.className = 'sr-cwd';
      cwd.textContent = row.info.cwd ?? '';
      el.appendChild(cwd);

      // pill: status + elapsed (or limited pill if pending resume)
      const pill = document.createElement('div');
      pill.className = 'sr-pill';
      const pillStatus = this.pillStatusClass(row);
      pill.classList.add(pillStatus);

      const pillDot = document.createElement('span');
      pillDot.className = 'sr-pill-dot';
      pill.appendChild(pillDot);

      const pillLabel = document.createElement('span');
      pillLabel.className = 'sr-pill-label';
      pillLabel.textContent = this.pillLabel(row);
      pill.appendChild(pillLabel);

      const ageSec = Math.max(0, Math.floor((now - row.statusSinceMs) / 1000));
      const pillTime = document.createElement('span');
      pillTime.className = 'sr-pill-time';
      pillTime.textContent = `· ${formatAge(ageSec)}`;
      pill.appendChild(pillTime);

      if (row.resumeAt !== null) {
        const cancel = document.createElement('span');
        cancel.className = 'sr-pill-cancel resume-cancel';
        cancel.textContent = '×';
        cancel.title = 'Cancel auto-resume';
        cancel.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.callbacks.onResumeCancel(row.info.id);
        });
        pill.appendChild(cancel);
      }

      el.appendChild(pill);

      el.addEventListener('click', () => this.callbacks.onRowClick(row.info.id));
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.showContextMenu(ev.clientX, ev.clientY, row.info.id);
      });
      this.listEl.appendChild(el);
    }
  }

  /** 'running' | 'awaiting' | 'limited' | 'idle' for the pill (matches handoff palette). */
  private pillStatusClass(row: SidebarRowVm): 'running' | 'awaiting' | 'limited' | 'idle' {
    if (row.resumeAt !== null) return 'limited';
    if (row.info.status === 'running') return 'running';
    if (row.info.status === 'awaiting-input') return 'awaiting';
    return 'idle';
  }

  /** Corner dot is only rendered for non-idle states (matches handoff). */
  private cornerDotClass(row: SidebarRowVm): '' | 'running' | 'awaiting' | 'limited' {
    if (row.resumeAt !== null) return 'limited';
    if (row.info.status === 'running') return 'running';
    if (row.info.status === 'awaiting-input') return 'awaiting';
    return '';
  }

  private pillLabel(row: SidebarRowVm): string {
    if (row.resumeAt !== null) return 'rate-limited';
    if (row.info.status === 'running') return 'running';
    if (row.info.status === 'awaiting-input') return 'awaiting input';
    return 'idle';
  }

  private showContextMenu(x: number, y: number, sessionId: SessionId): void {
    const existing = document.getElementById('sidebar-context-menu');
    existing?.remove();
    const menu = document.createElement('div');
    menu.id = 'sidebar-context-menu';
    menu.style.cssText = `position: fixed; top: ${y}px; left: ${x}px; background: #2d2d2d; color: #d4d4d4; border: 1px solid #333; border-radius: 4px; padding: 4px 0; z-index: 200; font-size: 12px; min-width: 140px; box-shadow: 0 4px 14px rgba(0,0,0,0.4);`;
    const mk = (label: string, fn: () => void) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.cssText = 'padding: 6px 14px; cursor: pointer;';
      item.addEventListener('mouseover', () => { item.style.background = '#094771'; });
      item.addEventListener('mouseout', () => { item.style.background = 'transparent'; });
      item.addEventListener('click', () => { menu.remove(); fn(); });
      menu.appendChild(item);
    };
    mk('Rename', () => this.callbacks.onRename(sessionId));
    mk('Duplicate', () => this.callbacks.onDuplicate(sessionId));
    mk('Restart', () => this.callbacks.onRestart(sessionId));
    mk('Close', () => this.callbacks.onClose(sessionId));
    document.body.appendChild(menu);
    const close = (): void => {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', onKey);
    };
    const dismiss = (ev: MouseEvent): void => {
      if (!menu.contains(ev.target as Node)) close();
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') close();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', dismiss);
      document.addEventListener('keydown', onKey);
    }, 0);
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
