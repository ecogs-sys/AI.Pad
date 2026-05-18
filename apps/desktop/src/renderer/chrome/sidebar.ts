import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface SidebarRowVm {
  info: SessionInfo;
  attention: boolean;
  /** Time the session entered its current status, in epoch ms. */
  statusSinceMs: number;
}

export interface SidebarCallbacks {
  onRowClick: (sessionId: SessionId) => void;
  onToggle: () => void;
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
      el.addEventListener('click', () => this.callbacks.onRowClick(row.info.id));
      this.listEl.appendChild(el);
    }
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
