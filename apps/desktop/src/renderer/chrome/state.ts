import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface SessionState {
  info: SessionInfo;
  attention: boolean;
  /** True when the tab's renderer crashed twice in 60s and stopped auto-recovering. */
  broken: boolean;
  /** Epoch ms when this session entered its current status. */
  statusSinceMs: number;
}

export interface ChromeState {
  sessions: Map<SessionId, SessionState>;
  tabOrder: SessionId[];
  focusedId: SessionId | null;
  sidebarOpen: boolean;
}

export function emptyState(): ChromeState {
  return {
    sessions: new Map(),
    tabOrder: [],
    focusedId: null,
    sidebarOpen: true,
  };
}
