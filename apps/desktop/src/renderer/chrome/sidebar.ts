import type { SessionId, SessionInfo } from '@aipad/contracts';
import { formatClock } from './tab-strip.js';

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

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = SHELL_ICONS[row.info.shell] ?? '??';
      el.appendChild(icon);

      const content = document.createElement('div');
      content.style.flex = '1';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title-text';
      titleSpan.textContent = row.info.title || row.info.shell;
      content.appendChild(titleSpan);

      const meta = document.createElement('span');
      meta.className = 'meta';
      const ageSec = Math.max(0, Math.floor((now - row.statusSinceMs) / 1000));
      meta.textContent = `${row.info.status} · ${formatAge(ageSec)}`;
      content.appendChild(meta);

      el.appendChild(content);

      if (row.resumeAt !== null) {
        const badge = document.createElement('span');
        badge.className = 'resume-badge';
        badge.title = 'Auto-resume scheduled';
        badge.appendChild(document.createTextNode(`⏳ ${formatClock(row.resumeAt)}`));
        const cancel = document.createElement('span');
        cancel.className = 'resume-cancel';
        cancel.textContent = '×';
        cancel.title = 'Cancel auto-resume';
        cancel.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.callbacks.onResumeCancel(row.info.id);
        });
        badge.appendChild(cancel);
        el.appendChild(badge);
      }

      el.addEventListener('click', () => this.callbacks.onRowClick(row.info.id));
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.showContextMenu(ev.clientX, ev.clientY, row.info.id);
      });
      this.listEl.appendChild(el);
    }
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
