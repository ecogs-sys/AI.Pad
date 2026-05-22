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
  private contextMenuEl: HTMLElement | null = null;
  private menuCleanup: (() => void) | null = null;
  private readonly bridge: PreloadBridge;
  private readonly shell: Shell;
  private readonly cwd: string;
  private readonly rootEl: HTMLElement;
  /** Primary session id of the owning tab — sent with every pane create so main can
   * scope pane cleanup to this tab. */
  private readonly tabId: SessionId;

  constructor(opts: SplitContainerOptions) {
    this.bridge = opts.bridge;
    this.shell = opts.shell;
    this.cwd = opts.cwd;
    this.rootEl = opts.rootEl;
    this.tabId = opts.initialSessionId;
    const leafEl = this.makePaneElement();
    this.rootEl.appendChild(leafEl);
    const host = new TerminalHost({ container: leafEl, sessionId: opts.initialSessionId, bridge: this.bridge });
    this.root = { kind: 'leaf', sessionId: opts.initialSessionId, host, el: leafEl };
    this.focused = this.root;
    this.wirePaneEvents(leafEl);
  }

  async splitFocused(orientation: Orientation): Promise<void> {
    const oldFocused = this.focused;
    const newSessionInfo = await this.bridge.send(IpcChannel.SessionCreateForPane, {
      shell: this.shell,
      cwd: this.cwd,
      cols: 80,
      rows: 24,
      tabId: this.tabId,
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
    this.wirePaneEvents(newLeafEl);
  }

  private wireDivider(branch: BranchNode, divider: HTMLElement): void {
    // Document-level move/up listeners exist only for the duration of a drag, so they
    // do not accumulate as more dividers are created.
    divider.addEventListener('mousedown', () => {
      const onMove = (ev: MouseEvent): void => {
        const rect = branch.el.getBoundingClientRect();
        const ratio = branch.orientation === 'horizontal'
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
        const clamped = Math.max(0.1, Math.min(0.9, ratio));
        branch.ratio = clamped;
        branch.a.el.style.flex = `1 1 ${clamped * 100}%`;
        branch.b.el.style.flex = `1 1 ${(1 - clamped) * 100}%`;
      };
      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /** Close the focused pane and promote its sibling. No-op for a single-pane tab —
   * the tab-level close (Ctrl+W) handles that case. */
  closeFocusedPane(): void {
    if (this.root.kind === 'leaf') return;
    const target = this.focused;
    const parent = this.findParent(this.root, target);
    if (!parent) return;
    const sibling = parent.a === target ? parent.b : parent.a;

    // End the pane's session and tear down its terminal.
    target.host.dispose();
    void this.bridge.send(IpcChannel.SessionClose, { sessionId: target.sessionId });

    // Replace the parent branch with the sibling subtree, in the DOM and the tree.
    sibling.el.style.flex = '1 1 100%';
    parent.el.parentElement?.replaceChild(sibling.el, parent.el);
    if (this.root === parent) {
      this.root = sibling;
    } else {
      const grandparent = this.findParent(this.root, parent);
      if (grandparent) {
        if (grandparent.a === parent) grandparent.a = sibling;
        else grandparent.b = sibling;
      }
    }

    this.focused = this.firstLeaf(sibling);
    this.focused.el.focus();
  }

  /** Wire focus tracking and the right-click context menu for a pane element. */
  private wirePaneEvents(el: HTMLElement): void {
    el.addEventListener('focusin', () => {
      // Walk the tree to find the leaf with this DOM element — keeps focus tracking correct after splits.
      this.focused = this.findLeafByElement(el) ?? this.focused;
    });
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // Right-clicking a pane focuses it, so split/close act on that pane.
      this.focused = this.findLeafByElement(el) ?? this.focused;
      this.openContextMenu(ev.clientX, ev.clientY);
    });
  }

  /** Render the pane context menu at the given viewport coordinates. */
  private openContextMenu(x: number, y: number): void {
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'pane-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const addItem = (label: string, run: () => void, disabled: boolean): void => {
      const item = document.createElement('div');
      item.className = disabled ? 'pane-menu-item disabled' : 'pane-menu-item';
      item.textContent = label;
      if (!disabled) {
        item.addEventListener('click', () => {
          this.closeContextMenu();
          run();
        });
      }
      menu.appendChild(item);
    };

    // Close Pane is unavailable for a single-pane tab — tab-level close (Ctrl+W) handles that.
    const singlePane = this.root.kind === 'leaf';
    addItem('Split Horizontally', () => void this.splitFocused('horizontal'), false);
    addItem('Split Vertically', () => void this.splitFocused('vertical'), false);
    addItem('Close Pane', () => this.closeFocusedPane(), singlePane);

    document.body.appendChild(menu);
    this.contextMenuEl = menu;

    // Keep the menu inside the viewport when opened near an edge.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - rect.width)}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - rect.height)}px`;

    const onDocMouseDown = (ev: MouseEvent): void => {
      if (!menu.contains(ev.target as Node)) this.closeContextMenu();
    };
    const onDocKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') this.closeContextMenu();
    };
    // onDocMouseDown is registered from the contextmenu handler, which always fires
    // after the initiating mousedown has completed — so it cannot close the menu for
    // the very right-click that opened it.
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKey);
    this.menuCleanup = (): void => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKey);
    };
  }

  /** Remove the context menu and its document listeners, if open. */
  private closeContextMenu(): void {
    this.menuCleanup?.();
    this.menuCleanup = null;
    this.contextMenuEl?.remove();
    this.contextMenuEl = null;
  }

  private findParent(node: SplitNode, target: SplitNode): BranchNode | null {
    if (node.kind === 'leaf') return null;
    if (node.a === target || node.b === target) return node;
    return this.findParent(node.a, target) ?? this.findParent(node.b, target);
  }

  private firstLeaf(node: SplitNode): LeafNode {
    return node.kind === 'leaf' ? node : this.firstLeaf(node.a);
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

  private findLeafByElement(el: HTMLElement): LeafNode | null {
    function walk(node: SplitNode): LeafNode | null {
      if (node.kind === 'leaf') return node.el === el ? node : null;
      return walk(node.a) ?? walk(node.b);
    }
    return walk(this.root);
  }

  getFocusedSessionId(): SessionId {
    return this.focused.sessionId;
  }
}
