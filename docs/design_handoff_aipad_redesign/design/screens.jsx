// ═══════════════════════════════════════════════════════════════════════════
// AI.Pad — Terminal panes, modals, full screens
// ═══════════════════════════════════════════════════════════════════════════

// ─── Terminal line renderer ───────────────────────────────────────────────
// Tokens accepted in a `lines` array:
//   ['prompt', 'PS C:\\Work>', 'Get-ChildItem packages']    → colored prompt
//   ['out', 'plain text']
//   ['dim', 'muted text']
//   ['green'|'cyan'|'yellow'|'blue'|'magenta'|'red', 'colored text']
//   ['ai', '▎ Welcome to claude-code v3.1']                  → AI block
//   ['tool', '⏵ scan packages/terminal-host', 'read 14 files']
//   ['blank']
//   ['cursor']                                               → blinking cursor

function TermLine({ line }) {
  const mono = { fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre' };
  const [kind, ...rest] = line;
  switch (kind) {
    case 'prompt':
      return <div style={mono}><span style={{ color: 'var(--term-blue)' }}>{rest[0]}</span>{rest[1] ? <> <span style={{ color: 'var(--term-yellow)' }}>{rest[1]}</span></> : null}{rest[2] ? <> <span style={{ color: 'var(--term-fg)' }}>{rest[2]}</span></> : null}</div>;
    case 'out':     return <div style={{ ...mono, color: 'var(--term-fg)'    }}>{rest[0]}</div>;
    case 'dim':     return <div style={{ ...mono, color: 'var(--term-dim)'   }}>{rest[0]}</div>;
    case 'green':   return <div style={{ ...mono, color: 'var(--term-green)' }}>{rest[0]}</div>;
    case 'cyan':    return <div style={{ ...mono, color: 'var(--term-cyan)'  }}>{rest[0]}</div>;
    case 'yellow':  return <div style={{ ...mono, color: 'var(--term-yellow)' }}>{rest[0]}</div>;
    case 'blue':    return <div style={{ ...mono, color: 'var(--term-blue)'  }}>{rest[0]}</div>;
    case 'magenta': return <div style={{ ...mono, color: 'var(--term-magenta)' }}>{rest[0]}</div>;
    case 'red':     return <div style={{ ...mono, color: 'var(--term-red)'   }}>{rest[0]}</div>;
    case 'ai':      return <div style={{ ...mono, color: 'var(--term-fg)', borderLeft: '2px solid var(--term-magenta)', paddingLeft: 12, marginLeft: -14 }}>{rest[0]}</div>;
    case 'tool':    return <div style={{ ...mono, color: 'var(--term-cyan)' }}>{rest[0]}{rest[1] && <span style={{ color: 'var(--term-dim)' }}>{'  '}{rest[1]}</span>}</div>;
    case 'blank':   return <div style={{ ...mono, height: '1.6em' }}>&nbsp;</div>;
    case 'cursor':  return <div style={mono}><span style={{ color: 'var(--term-fg)' }}>{rest[0] || ''}</span><span className="aip-cursor" style={{ display: 'inline-block', width: 8, height: '1em', background: 'var(--term-fg)', verticalAlign: 'middle', marginLeft: 2 }} /></div>;
    default:        return <div style={mono}>{rest[0]}</div>;
  }
}

function TerminalPane({ lines, accent, scrollbar = true, padding = 18 }) {
  return (
    <div style={{ flex: 1, background: 'var(--term-bg)', position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ flex: 1, padding, paddingRight: padding + 4, overflow: 'hidden' }}>
        {lines.map((l, i) => <TermLine key={i} line={l} />)}
      </div>
      {scrollbar && (
        <div style={{ position: 'absolute', top: 8, right: 4, bottom: 8, width: 6, borderRadius: 3 }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '38%', background: 'var(--bg-4)', borderRadius: 2 }} />
        </div>
      )}
    </div>
  );
}

// ─── Sample terminal content ──────────────────────────────────────────────
const TERM_DEFAULT = [
  ['prompt', 'PS C:\\Work\\ecogs\\projects\\AI.Pad>', 'Get-ChildItem packages', '| Select-Object Name'],
  ['blank'],
  ['green', 'Name'],
  ['dim',   '----'],
  ['out',   'contracts'],
  ['out',   'core'],
  ['out',   'keymap'],
  ['out',   'terminal-host'],
  ['blank'],
  ['prompt', 'PS C:\\Work\\ecogs\\projects\\AI.Pad>', 'claude', '--continue'],
  ['blank'],
  ['ai', '▎ Welcome back. Resuming session #4128.'],
  ['ai', '▎'],
  ['ai', '▎ Last task: refactor terminal-host IPC layer'],
  ['ai', '▎ Files modified: 6 · Tests passing: 24/24'],
  ['blank'],
  ['tool', '⏵ read packages/terminal-host/src/ipc.ts',  '320 lines'],
  ['tool', '⏵ read packages/terminal-host/src/pty.ts',  '186 lines'],
  ['tool', '⏵ grep "EventEmitter" in src/',             '4 matches'],
  ['blank'],
  ['ai', '▎ The IPC layer still routes via a single EventEmitter — I can'],
  ['ai', '▎ swap it for a typed MessagePort bus. Estimated diff: ~140 LOC.'],
  ['blank'],
  ['yellow', '? Proceed with the refactor?  [y/n/show plan]'],
  ['cursor', '› '],
];

const TERM_AWAITING = [
  ['prompt', 'PS C:\\Work\\ecogs\\projects\\AI.Pad>', 'codex'],
  ['blank'],
  ['ai', '▎ codex-cli v0.4.2'],
  ['blank'],
  ['tool', '⏵ analyze package structure', 'done'],
  ['tool', '⏵ generate test scaffolding', 'pending approval'],
  ['blank'],
  ['ai', '▎ I want to create 14 new test files across 3 packages.'],
  ['ai', '▎ Files will be added under each package\'s tests/ directory.'],
  ['blank'],
  ['yellow', '? Approve file creation?'],
  ['dim',    '   [a]pprove all   [r]eject   [d]iff'],
  ['cursor', '› '],
];

const TERM_LIMITED = [
  ['prompt', 'PS C:\\Work>', 'claude', 'plan'],
  ['blank'],
  ['ai', '▎ Working on your task...'],
  ['blank'],
  ['tool', '⏵ read 8 files', 'done'],
  ['tool', '⏵ draft refactor plan', 'in progress'],
  ['blank'],
  ['red', '⚠ You\'ve hit your usage limit.'],
  ['dim', '  Quota resets in 47 minutes.'],
  ['blank'],
  ['dim', '  AI.Pad will auto-resume when quota refreshes.'],
  ['dim', '  Press [c] to continue manually  ·  [q] to quit'],
  ['cursor', ''],
];

// ─── Modal scrim ──────────────────────────────────────────────────────────
function ModalScrim({ children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-overlay)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120, zIndex: 10 }}>
      {children}
    </div>
  );
}

// ─── Settings modal ───────────────────────────────────────────────────────
function SettingsModal({ accent }) {
  const section = { padding: '18px 22px', borderBottom: '1px solid var(--border-1)' };
  const label = { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 };
  const input = { width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-1)', outline: 'none' };

  return (
    <div style={{ width: 560, background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 10, boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1.4 }}>Settings</span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-4)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-1)' }}>Auto-resume</span>
        </div>
        <div style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 14 }}>×</div>
      </div>

      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 36, height: 20, borderRadius: 999, background: accent, position: 'relative', flexShrink: 0, marginTop: 2 }}>
            <div style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500, marginBottom: 3 }}>Auto-resume rate-limited tabs</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>When an agent hits its quota and you've set a response below, AI.Pad will send that response automatically once the quota refreshes.</div>
          </div>
        </div>
      </div>

      <div style={section}>
        <div style={label}>Text to detect</div>
        <div style={{ ...input, border: `1px solid ${accent}`, boxShadow: `0 0 0 3px var(--accent-soft)` }}>
          You've hit your limit
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {['You\'ve hit your limit', 'rate limit reached', 'quota exceeded'].map((p, i) => (
            <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', background: 'var(--bg-1)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-1)' }}>{p}</span>
          ))}
        </div>
      </div>

      <div style={section}>
        <div style={label}>Response to send</div>
        <div style={input}>continue</div>
      </div>

      <div style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>3 rules configured</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '7px 14px', fontFamily: 'var(--font-sans)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button style={{ background: accent, color: '#0d1117', border: 'none', borderRadius: 6, padding: '7px 16px', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Command palette ──────────────────────────────────────────────────────
function CommandPalette({ accent }) {
  const sections = [
    {
      title: 'Switch to session',
      items: [
        { kind: 'PS', name: 'claude · refactor terminal-host', meta: '~/AI.Pad', status: 'awaiting', shortcut: '⌘1' },
        { kind: 'PS', name: 'codex · add e2e tests',           meta: '~/AI.Pad', status: 'limited',  shortcut: '⌘2' },
        { kind: 'PS', name: 'pwsh · package scripts',          meta: '~/AI.Pad', status: 'running',  shortcut: '⌘3' },
      ],
    },
    {
      title: 'Start session',
      items: [
        { kind: '+', name: 'New Claude Code session', meta: 'claude', shortcut: '⌘N' },
        { kind: '+', name: 'New Codex session',       meta: 'codex' },
        { kind: '+', name: 'New PowerShell',          meta: 'pwsh.exe' },
      ],
    },
    {
      title: 'Actions',
      items: [
        { kind: '⌘', name: 'Split pane right',        shortcut: '⌘D' },
        { kind: '⌘', name: 'Settings…',               shortcut: '⌘,' },
        { kind: '⌘', name: 'Toggle sidebar',          shortcut: '⌘B' },
      ],
    },
  ];

  return (
    <div style={{ width: 620, maxHeight: 520, background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 12, boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--text-4)', fontSize: 13 }}>⌘K</span>
        <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-1)' }}>
          claude<span className="aip-cursor" style={{ display: 'inline-block', width: 7, height: 14, background: accent, verticalAlign: '-2px', marginLeft: 2 }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)', background: 'var(--bg-1)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-1)' }}>esc</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '6px 0' }}>
        {sections.map((sec, si) => (
          <div key={si}>
            <div style={{ padding: '10px 18px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-4)', fontWeight: 600 }}>{sec.title}</div>
            {sec.items.map((it, ii) => {
              const active = si === 0 && ii === 0;
              return (
                <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px', background: active ? 'var(--bg-3)' : 'transparent', borderLeft: active ? `2px solid ${accent}` : '2px solid transparent' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--bg-1)', border: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', fontWeight: 600 }}>{it.kind}</div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, color: active ? 'var(--text-1)' : 'var(--text-2)' }}>{it.name}</span>
                    {it.meta && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>{it.meta}</span>}
                  </div>
                  {it.status && <StatusBadge status={it.status} style="pill" />}
                  {it.shortcut && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)', background: 'var(--bg-1)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-1)' }}>{it.shortcut}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border-1)', padding: '8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <span><span style={{ color: 'var(--text-3)' }}>↑↓</span> navigate</span>
          <span><span style={{ color: 'var(--text-3)' }}>↵</span> open</span>
          <span><span style={{ color: 'var(--text-3)' }}>⇥</span> filter</span>
        </div>
        <span>9 results</span>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyState({ accent }) {
  const card = (label, mono, kbd, primary) => (
    <div style={{
      flex: 1,
      background: primary ? 'var(--bg-2)' : 'var(--bg-1)',
      border: primary ? `1px solid ${accent}` : '1px solid var(--border-1)',
      borderRadius: 10,
      padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative',
      boxShadow: primary ? `0 0 0 3px var(--accent-soft)` : 'none',
    }}>
      <div style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: primary ? accent : 'var(--text-3)' }}>{mono}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>{kbd}</span>
        <span style={{ color: primary ? accent : 'var(--text-4)', fontSize: 14 }}>→</span>
      </div>
    </div>
  );
  return (
    <div style={{ flex: 1, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 540, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{ width: 64, height: 64 }}><AppGlyph accent={accent} size={64} /></div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: -0.3 }}>AI.Pad</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>run many agents · never miss a prompt</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          {card('New session',     'claude · codex · pwsh',  '⌘N',  true)}
          {card('Resume',          '3 sessions from last time', '⌘R')}
        </div>
        <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.2, color: 'var(--text-4)', textTransform: 'uppercase', fontWeight: 600 }}>Recent</div>
          {[
            { name: 'AI.Pad · refactor', cwd: '~/Work/ecogs/projects/AI.Pad', when: '14m ago' },
            { name: 'web-app · billing', cwd: '~/Work/web-app',               when: 'yesterday' },
            { name: 'cli-tools',         cwd: '~/personal/cli-tools',         when: '3 days ago' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>PS</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-2)' }}>{r.name}</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>{r.cwd}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>{r.when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TermLine, TerminalPane, TERM_DEFAULT, TERM_AWAITING, TERM_LIMITED, ModalScrim, SettingsModal, CommandPalette, EmptyState });
