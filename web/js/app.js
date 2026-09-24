/* hirc web console — petite-vue store: state, derived data, actions. */
/* global PetiteVue */

const KIND = {
  claude: '#d97757', codex: '#565869', devin: '#7aa2f7', gemini: '#4285f4',
  kimi: '#1783ff', kiro: '#9046ff', qwen: '#615ced', deepseek: '#4d6bfe',
  opencode: '#6b9bd2', cline: '#586876', kilo: '#9a9808', amp: '#c98a1f',
  grok: '#444444', copilot: '#2da44e', pi: '#4c9a5a', omp: '#b5559d',
  human: '#4c9a5a',
};
const ICONS = new Set(['agy', 'amp', 'claude', 'cline', 'codex', 'copilot', 'cursor',
  'deepseek', 'devin', 'gemini', 'glm', 'gpt', 'grok', 'hermes', 'kilo', 'kimi',
  'kiro', 'maki', 'mastracode', 'omp', 'opencode', 'pi', 'qodercli', 'qwen']);
const STATUS_RANK = { blocked: 0, working: 1, unknown: 2, idle: 3, done: 4 };
const now = () => Math.floor(Date.now() / 1000);
const time = ts => new Date(ts * 1000).toTimeString().slice(0, 8);

PetiteVue.createApp({
  // ---- state ----
  agents: [], workspaces: [], messages: [], me: null,
  online: false, host: location.host,
  sel: localStorage.hircSel || null,
  filter: localStorage.hircFilter || 'all',
  to: '', body: '', receipt: '', out: '',
  notify: localStorage.hircNotify === '1',
  lastSeen: JSON.parse(localStorage.hircSeen || '{}'),
  seenCount: +(localStorage.hircCount || 0),

  // ---- lifecycle ----
  init() {
    this.poll();
    this._timers = [setInterval(() => this.poll(), 2500), setInterval(() => this.tail(), 3000)];
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
        e.preventDefault(); document.querySelector('.composer input[aria-label="message"]')?.focus();
      }
      if (e.key === 'Escape') this.setFilter('all');
    });
    this._feed = document.getElementById('feed');
  },

  // ---- derived ----
  get nBlocked() { return this.agents.filter(a => a.status === 'blocked').length; },
  get groups() {
    const label = Object.fromEntries(this.workspaces.map(w => [w.workspace_id, w.label || w.workspace_id]));
    const focus = Object.fromEntries(this.workspaces.map(w => [w.workspace_id, w.focused]));
    const by = {};
    for (const a of this.agents) (by[a.workspace] ||= []).push(a);
    return Object.entries(by).map(([id, agents]) => ({
      id, label: label[id] || id, focused: !!focus[id],
      agents: [...agents].sort((x, y) => (STATUS_RANK[x.status] ?? 5) - (STATUS_RANK[y.status] ?? 5)),
    }));
  },
  get pairs() {
    const keys = this.messages.filter(m => /delivered/.test(m.result)).map(m =>
      m.to === 'human' ? `${m.from}→human` : [m.from || '?', m.to].sort().join('↔'));
    return [...new Set(keys)].slice(-12);
  },
  get feed() {
    const ms = this.filter === 'all' ? this.messages
      : this.messages.filter(m => (m.to === 'human' ? `${m.from}→human` : [m.from || '?', m.to].sort().join('↔')) === this.filter);
    return ms;
  },
  get addrBook() { return ['all', 'human', ...this.agents.map(a => a.address)]; },

  // ---- helpers ----
  kindFor(addr) { return this.agents.find(a => a.address === addr)?.kind || (addr === 'human' ? 'human' : '?'); },
  kindColor(k) { return KIND[k] || '#3a3a48'; },
  kindLetters(k) { return (k === 'human' ? 'Hu' : (k || '?').slice(0, 2)); },
  hasIcon(k) { return ICONS.has(k); },
  isOk(r) { return /delivered/.test(r || ''); },
  time,
  unreadFor(addr) {
    const seen = this.lastSeen[addr] || 0;
    return this.messages.filter(m => m.ts > seen && (m.from === addr || m.to === addr)).length;
  },

  // ---- actions ----
  async poll() {
    try {
      const d = await (await fetch('/api/state')).json();
      if (d.messages.length > this.seenCount && this.notify && Notification.permission === 'granted') {
        for (const m of d.messages.slice(this.seenCount).filter(m => m.to === 'human'))
          new Notification(`hirc · ${m.from}`, { body: (m.body || '').slice(0, 120) });
      }
      this.seenCount = Math.max(this.seenCount, d.messages.length);
      localStorage.hircCount = this.seenCount;
      const stick = this._feed && (this._feed.scrollHeight - this._feed.scrollTop - this._feed.clientHeight < 40);
      Object.assign(this, { agents: d.agents, workspaces: d.workspaces, messages: d.messages, me: d.me });
      this.online = true;
      document.title = `hirc${this.nBlocked ? ` (${this.nBlocked} blocked)` : ''}`;
      if (stick) requestAnimationFrame(() => { this._feed.scrollTop = this._feed.scrollHeight; });
    } catch { this.online = false; }
  },
  async tail() {
    if (!this.sel) return;
    try {
      const d = await (await fetch(`/api/agent/${encodeURIComponent(this.sel)}/output?lines=120`)).json();
      this.out = d.output || d.error || '';
    } catch { /* keep last frame */ }
  },
  select(a) {
    this.sel = a.address; localStorage.hircSel = a.address;
    this.to = a.address;
    this.lastSeen[a.address] = now();
    localStorage.hircSeen = JSON.stringify(this.lastSeen);
    this.tail();
  },
  setFilter(p) { this.filter = p; localStorage.hircFilter = p; },
  async toggleBell() {
    this.notify = !this.notify;
    if (this.notify && Notification.permission !== 'granted')
      this.notify = (await Notification.requestPermission()) === 'granted';
    localStorage.hircNotify = this.notify ? '1' : '0';
  },
  async send() {
    const to = this.to.trim(), body = this.body.trim();
    if (!to || !body) return;
    this.body = '';
    const r = await fetch('/api/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, body }),
    });
    const d = await r.json();
    this.receipt = (d.receipts || [d.error]).join('  ');
    setTimeout(() => this.poll(), 400);
  },
}).mount();
