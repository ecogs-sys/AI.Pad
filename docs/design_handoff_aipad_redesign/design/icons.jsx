// AI.Pad app icon — 3 directions. Each is a self-contained SVG rendered into
// a 1024-unit viewBox so it scales from favicon to App Store size cleanly.

// ─── Direction A: refined evolution of current ────────────────────────────
// Same DNA as the existing icon (rounded square + status dots + cursor),
// but tighter geometry, single accent vs three muted hues, and a cursor
// that reads as a session prompt.
function IconA({ accent = '#7CA8E0' }) {
  return (
    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="iconA-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2f38" />
          <stop offset="1" stopColor="#1a1d24" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#iconA-bg)" />
      <rect width="1024" height="1024" rx="224" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
      {/* status row */}
      <circle cx="260" cy="320" r="60" fill="#9bc8a3" />
      <circle cx="436" cy="320" r="60" fill={accent} />
      <circle cx="612" cy="320" r="60" fill="#e0c477" />
      <circle cx="788" cy="320" r="60" fill="#6e7480" opacity="0.55" />
      {/* prompt + cursor */}
      <path d="M 260 600 L 420 700 L 260 800" fill="none" stroke="#e8eaee" strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="500" y="760" width="264" height="44" rx="6" fill={accent} />
    </svg>
  );
}

// ─── Direction B: pad as physical artifact ────────────────────────────────
// "AI.Pad" → reads as a stylized notepad / scratch surface with a live caret.
// Strong wordmark feel; works tiny.
function IconB({ accent = '#7CA8E0' }) {
  return (
    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="iconB-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f232b" />
          <stop offset="1" stopColor="#13151a" />
        </linearGradient>
        <linearGradient id="iconB-sheet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e333d" />
          <stop offset="1" stopColor="#262a33" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#iconB-bg)" />
      {/* pad sheet */}
      <rect x="184" y="216" width="656" height="640" rx="56" fill="url(#iconB-sheet)" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      {/* binding rings */}
      <circle cx="260" cy="216" r="26" fill="#0e1014" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      <circle cx="512" cy="216" r="26" fill="#0e1014" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      <circle cx="764" cy="216" r="26" fill="#0e1014" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      {/* prompt lines */}
      <path d="M 268 416 L 360 478 L 268 540" fill="none" stroke={accent} strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="404" y="464" width="216" height="28" rx="6" fill="rgba(255,255,255,0.85)" />
      <rect x="268" y="608" width="488" height="20" rx="6" fill="rgba(255,255,255,0.32)" />
      <rect x="268" y="676" width="380" height="20" rx="6" fill="rgba(255,255,255,0.22)" />
      <rect x="268" y="744" width="296" height="20" rx="6" fill="rgba(255,255,255,0.14)" />
    </svg>
  );
}

// ─── Direction C: stacked sessions ────────────────────────────────────────
// Visualizes the core value prop: many agents at once. Three offset cards,
// each with a status dot. Most metaphorically aligned with the product.
function IconC({ accent = '#7CA8E0' }) {
  return (
    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="iconC-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#252a33" />
          <stop offset="1" stopColor="#15171d" />
        </linearGradient>
        <linearGradient id="iconC-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#373d49" />
          <stop offset="1" stopColor="#2a2f38" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#iconC-bg)" />
      {/* back card */}
      <rect x="252" y="252" width="600" height="120" rx="28" fill="#2a2f38" opacity="0.55" />
      <circle cx="316" cy="312" r="20" fill="#e0c477" />
      <rect x="364" y="298" width="200" height="14" rx="5" fill="rgba(255,255,255,0.30)" />
      <rect x="364" y="326" width="120" height="10" rx="4" fill="rgba(255,255,255,0.16)" />
      {/* middle card */}
      <rect x="212" y="412" width="640" height="120" rx="28" fill="#30353f" opacity="0.85" />
      <circle cx="276" cy="472" r="20" fill="#e07a7a" />
      <rect x="324" y="458" width="216" height="14" rx="5" fill="rgba(255,255,255,0.42)" />
      <rect x="324" y="486" width="132" height="10" rx="4" fill="rgba(255,255,255,0.20)" />
      {/* front card (active) */}
      <rect x="172" y="572" width="680" height="200" rx="32" fill="url(#iconC-card)" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
      <circle cx="240" cy="672" r="24" fill={accent} />
      <circle cx="240" cy="672" r="38" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="4" />
      <path d="M 308 644 L 364 672 L 308 700" fill="none" stroke="#e8eaee" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="396" y="660" width="288" height="24" rx="6" fill="rgba(255,255,255,0.78)" />
    </svg>
  );
}

Object.assign(window, { IconA, IconB, IconC });
