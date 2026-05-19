import { TerminalHost, type PreloadBridge } from '@aipad/terminal-host';
import type { SessionId, Shell } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';

type Orientation = 'horizontal' | 'vertical';

interface LeafNode {
  kind: 'leaf';
  sessionId: SessionId;
  host: TerminalHost;
  el: HTMLElement;
}

interface BranchNode {
  kind: 'branch';
  orientation: Orientation;
  ratio: number; // 0..1
  a: SplitNode;
  b: SplitNode;
  el: HTMLElement;
}

type SplitNode = LeafNode | BranchNode;

export interface SplitContainerOptions {
  rootEl: HTMLElement;
  bridge: PreloadBridge;
  initialSessionId: SessionId;
  shell: Shell;
  cwd: string;
}

export class SplitContainer {
  private root: SplitNode;
  private focused: LeafNode;
  private readonly bridge: PreloadBridge;
  private readonly shell: Shell;
  private readonly cwd: string;
  private readonly rootEl: HTMLElement;

  constructor(opts: SplitContainerOptions) {
    this.bridge = opts.bridge;
    this.shell = opts.shell;
    this.cwd = opts.cwd;
    this.rootEl = opts.rootEl;
    const leafEl = this.makePaneElement();
    this.rootEl.appendChild(leafEl);
    const host = new TerminalHost({ container: leafEl, sessionId: opts.initialSessionId, bridge: this.bridge });
    this.root = { kind: 'leaf', sessionId: opts.initialSessionId, host, el: leafEl };
    this.focused = this.root;
    leafEl.addEventListener('focusin', () => { if (this.root.kind === 'leaf') this.focused = this.root; });
  }

  async splitFocused(orientation: Orientation): Promise<void> {
    const oldFocused = this.focused;
    const newSessionInfo = await this.bridge.send(IpcChannel.SessionCreateForPane, {
      shell: this.shell,
      cwd: this.cwd,
      cols: 80,
      rows: 24,
    }) as { id: string } | { error: string };
    if ('error' in newSessionInfo) {
      console.error('[split] create pane failed:', newSessionInfo.error);
      return;
    }
    const newSessionId = newSessionInfo.id as SessionId;

    const branchEl = document.createElement('div');
    branchEl.style.display = 'flex';
    branchEl.style.flexDirection = orientation === 'horizontal' ? 'row' : 'column';
    branchEl.style.width = '100%';
    branchEl.style.height = '100%';

    const newLeafEl = this.makePaneElement();
    const divider = document.createElement('div');
    divider.style.background = '#333';
    divider.style.flex = '0 0 4px';
    divider.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';

    oldFocused.el.parentElement?.replaceChild(branchEl, oldFocused.el);
    oldFocused.el.style.flex = '1 1 50%';
    newLeafEl.style.flex = '1 1 50%';
    branchEl.appendChild(oldFocused.el);
    branchEl.appendChild(divider);
    branchEl.appendChild(newLeafEl);

    const newHost = new TerminalHost({ container: newLeafEl, sessionId: newSessionId, bridge: this.bridge });
    const newLeaf: LeafNode = { kind: 'leaf', sessionId: newSessionId, host: newHost, el: newLeafEl };

    const branch: BranchNode = {
      kind: 'branch',
      orientation,
      ratio: 0.5,
      a: oldFocused,
      b: newLeaf,
      el: branchEl,
    };
    // Replace the old leaf in the tree with the new branch.
    this.root = this.replaceInTree(this.root, oldFocused, branch) ?? branch;

    this.wireDivider(branch, divider);

    this.focused = newLeaf;
    newLeafEl.addEventListener('focusin', () => { this.focused = newLeaf; });
    newHost.dispose;  // referenced; do not actually call yet
  }

  private wireDivider(branch: BranchNode, divider: HTMLElement): void {
    let dragging = false;
    divider.addEventListener('mousedown', () => { dragging = true; });
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const rect = branch.el.getBoundingClientRect();
      const ratio = branch.orientation === 'horizontal'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      const clamped = Math.max(0.1, Math.min(0.9, ratio));
      branch.ratio = clamped;
      branch.a.el.style.flex = `1 1 ${clamped * 100}%`;
      branch.b.el.style.flex = `1 1 ${(1 - clamped) * 100}%`;
    });
  }

  private replaceInTree(node: SplitNode, target: SplitNode, replacement: SplitNode): SplitNode | null {
    if (node === target) return replacement;
    if (node.kind === 'leaf') return null;
    const a = this.replaceInTree(node.a, target, replacement);
    if (a) { node.a = a; return node; }
    const b = this.replaceInTree(node.b, target, replacement);
    if (b) { node.b = b; return node; }
    return null;
  }

  private makePaneElement(): HTMLElement {
    const el = document.createElement('div');
    el.style.flex = '1 1 100%';
    el.style.minWidth = '0';
    el.style.minHeight = '0';
    el.style.height = '100%';
    el.tabIndex = 0;
    return el;
  }

  getFocusedSessionId(): SessionId {
    return this.focused.sessionId;
  }
}
