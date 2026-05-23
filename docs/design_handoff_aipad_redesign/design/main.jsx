// ═══════════════════════════════════════════════════════════════════════════
// AI.Pad — Main: screen compositions + canvas + tweaks
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT_OPTIONS = ['#7CA8E0', '#9BC8A3', '#C9A56B', '#B89BD9', '#7BC1C5'];
const BADGE_STYLES   = ['pill', 'dot', 'icon'];

// ─── Mock session data ────────────────────────────────────────────────────
const SESSIONS_SOLO = [
  { id: 'a', kind: 'PS', name: 'pwsh.exe',  cwd: '~/Work/ecogs/projects/AI.Pad', status: 'running',  time: '3s' },
];

const SESSIONS_MULTI = [
  { id: 'a', kind: 'PS', name: 'claude · refactor', cwd: '~/Work/ecogs/projects/AI.Pad', status: 'awaiting', time: '1m 14s' },
  { id: 'b', kind: 'PS', name: 'codex · tests',     cwd: '~/Work/ecogs/projects/AI.Pad', status: 'limited',  time: '47m' },
  { id: 'c', kind: 'PS', name: 'pwsh.exe',          cwd: '~/Work/ecogs/projects/AI.Pad', status: 'running',  time: '10s' },
  { id: 'd', kind: 'PS', name: 'pwsh.exe',          cwd: '~/Work/ecogs/projects/AI.Pad', status: 'idle',     time: '4m' },
];

const TABS_SOLO = [
  { label: 'pwsh.exe', status: 'running' },
];

const TABS_MULTI = [
  { label: 'claude · refactor', status: 'awaiting' },
  { label: 'codex · tests',     status: 'limited' },
  { label: 'pwsh.exe',          status: 'running' },
  { label: 'pwsh.exe',          status: 'idle' },
];

// ─── Shell: titlebar + tabs + body slot ───────────────────────────────────
function Shell({ children, tabs, activeIdx, accent, title = 'AI.Pad', subtitle, showTabs = true }) {
  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-0)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-1)', position: 'relative' }}>
      <TitleBar accent={accent} title={title} subtitle={subtitle} />
      {showTabs && tabs && <TabBar tabs={tabs} activeIdx={activeIdx} accent={accent} />}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Screen 1: Main · single session running ──────────────────────────────
function MainScreen({ accent, badgeStyle }) {
  return (
    <Shell tabs={TABS_SOLO} activeIdx={0} accent={accent} subtitle="pwsh.exe">
      <Sidebar sessions={SESSIONS_SOLO} activeId="a" badgeStyle={badgeStyle} accent={accent} />
      <TerminalPane lines={TERM_DEFAULT} accent={accent} />
    </Shell>
  );
}

// ─── Screen 2: Multi-session, awaiting input on tab #1 ────────────────────
function MultiScreen({ accent, badgeStyle }) {
  return (
    <Shell tabs={TABS_MULTI} activeIdx={0} accent={accent} subtitle="claude · refactor — awaiting input">
      <Sidebar sessions={SESSIONS_MULTI} activeId="a" badgeStyle={badgeStyle} accent={accent} />
      <TerminalPane lines={TERM_AWAITING} accent={accent} />
    </Shell>
  );
}

// ─── Screen 3: Split panes ────────────────────────────────────────────────
function SplitScreen({ accent, badgeStyle }) {
  return (
    <Shell tabs={TABS_MULTI} activeIdx={0} accent={accent} subtitle="claude + codex · split">
      <Sidebar sessions={SESSIONS_MULTI} activeId="a" badgeStyle={badgeStyle} accent={accent} />
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: 0.8, textTransform: 'uppercase', zIndex: 2, background: 'var(--term-bg)', padding: '2px 6px', borderRadius: 3 }}>
            claude · refactor
          </div>
          <TerminalPane lines={TERM_AWAITING} accent={accent} padding={22} />
        </div>
        <div style={{ width: 1, background: 'var(--border-2)' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: 0.8, textTransform: 'uppercase', zIndex: 2, background: 'var(--term-bg)', padding: '2px 6px', borderRadius: 3 }}>
            codex · tests
          </div>
          <TerminalPane lines={TERM_LIMITED} accent={accent} padding={22} />
        </div>
      </div>
    </Shell>
  );
}

// ─── Screen 4: Empty state ────────────────────────────────────────────────
function EmptyScreen({ accent }) {
  return (
    <Shell accent={accent} subtitle="no active sessions" showTabs={false}>
      <EmptyState accent={accent} />
    </Shell>
  );
}

// ─── Screen 5: Settings modal ─────────────────────────────────────────────
function SettingsScreen({ accent, badgeStyle }) {
  return (
    <Shell tabs={TABS_MULTI} activeIdx={0} accent={accent} subtitle="Settings · Auto-resume">
      <Sidebar sessions={SESSIONS_MULTI} activeId="a" badgeStyle={badgeStyle} accent={accent} />
      <TerminalPane lines={TERM_DEFAULT} accent={accent} />
      <ModalScrim>
        <SettingsModal accent={accent} />
      </ModalScrim>
    </Shell>
  );
}

// ─── Screen 6: Command palette ────────────────────────────────────────────
function PaletteScreen({ accent, badgeStyle }) {
  return (
    <Shell tabs={TABS_MULTI} activeIdx={0} accent={accent} subtitle="Command palette · ⌘K">
      <Sidebar sessions={SESSIONS_MULTI} activeId="a" badgeStyle={badgeStyle} accent={accent} />
      <TerminalPane lines={TERM_AWAITING} accent={accent} />
      <ModalScrim>
        <CommandPalette accent={accent} />
      </ModalScrim>
    </Shell>
  );
}

// ─── Icon artboards ───────────────────────────────────────────────────────
function IconBoard({ Icon, accent, name, note }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, background: 'linear-gradient(180deg, var(--bg-1), var(--bg-0))' }}>
        <div style={{ width: 220, height: 220, borderRadius: 48, boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)' }}>
          <Icon accent={accent} />
        </div>
      </div>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-1)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8 }}><Icon accent={accent} /></div>
        <div style={{ width: 22, height: 22, borderRadius: 5 }}><Icon accent={accent} /></div>
        <div style={{ width: 14, height: 14, borderRadius: 3 }}><Icon accent={accent} /></div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{note}</div>
        </div>
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(window.__TWEAK_DEFAULTS);

  // Push accent into CSS custom property so it cascades into anything that
  // references var(--accent) (focus rings, etc.).
  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    // derive soft / glow
    const hex = t.accent;
    document.documentElement.style.setProperty('--accent-soft', hex + '2e');
    document.documentElement.style.setProperty('--accent-glow', hex + '59');
  }, [t.accent]);

  const accent = t.accent;
  const badgeStyle = t.badgeStyle;

  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection id="screens" title="Screens">
          <DCArtboard id="main"     label="Main · single session"        width={1400} height={880}>
            <MainScreen accent={accent} badgeStyle={badgeStyle} />
          </DCArtboard>
          <DCArtboard id="multi"    label="Multi-session · attention sort" width={1400} height={880}>
            <MultiScreen accent={accent} badgeStyle={badgeStyle} />
          </DCArtboard>
          <DCArtboard id="split"    label="Split panes"                  width={1400} height={880}>
            <SplitScreen accent={accent} badgeStyle={badgeStyle} />
          </DCArtboard>
          <DCArtboard id="empty"    label="Empty state · onboarding"     width={1400} height={880}>
            <EmptyScreen accent={accent} />
          </DCArtboard>
        </DCSection>

        <DCSection id="overlays" title="Modals & overlays">
          <DCArtboard id="settings" label="Settings · Auto-resume"       width={1400} height={880}>
            <SettingsScreen accent={accent} badgeStyle={badgeStyle} />
          </DCArtboard>
          <DCArtboard id="palette"  label="Command palette · ⌘K"         width={1400} height={880}>
            <PaletteScreen accent={accent} badgeStyle={badgeStyle} />
          </DCArtboard>
        </DCSection>

        <DCSection id="icon" title="App icon — 3 directions">
          <DCArtboard id="icon-a" label="A · refined evolution"          width={460} height={520}>
            <IconBoard Icon={IconA} accent={accent} name="Direction A" note="status row + prompt" />
          </DCArtboard>
          <DCArtboard id="icon-b" label="B · the pad as artifact"        width={460} height={520}>
            <IconBoard Icon={IconB} accent={accent} name="Direction B" note="notepad surface" />
          </DCArtboard>
          <DCArtboard id="icon-c" label="C · stacked sessions"           width={460} height={520}>
            <IconBoard Icon={IconC} accent={accent} name="Direction C" note="many agents, one pad" />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Accent">
          <TweakColor
            label="Color"
            value={t.accent}
            onChange={(v) => setTweak('accent', v)}
            options={ACCENT_OPTIONS}
          />
        </TweakSection>
        <TweakSection label="Sidebar">
          <TweakRadio
            label="Status badge"
            value={t.badgeStyle}
            onChange={(v) => setTweak('badgeStyle', v)}
            options={BADGE_STYLES}
          />
        </TweakSection>
      </TweaksPanel>

      <style>{`
        @keyframes aip-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .aip-cursor { animation: aip-blink 1.05s steps(1) infinite; }
      `}</style>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
