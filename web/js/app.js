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
const dateStr = ts => {
  const d = new Date(ts * 1000), t = new Date(), y = new Date(Date.now() - 864e5);
  const same = (a, b) => a.toDateString() === b.toDateString();
  return same(d, t) ? 'today' : same(d, y) ? 'yesterday' : d.toLocaleDateString();
};

PetiteVue.createApp({
  // ---- state ----
  agents: [], workspaces: [], messages: [], pending: [], me: null,
  machines: [], machine: localStorage.hircMachine || '',
  online: false, host: location.host,
  sel: localStorage.hircSel || null,
  view: 'feed', feedSeen: now(), drawer: false,
  filter: localStorage.hircFilter || 'all',
  notify: localStorage.hircNotify === '1',
  theme: localStorage.hircTheme || 'system',
  lastSeen: JSON.parse(localStorage.hircSeen || '{}'),
  seenCount: +(localStorage.hircCount || 0),

  // ---- lifecycle ----
  init() {
    this.poll();
    fetch('/api/machines').then(r => r.json()).then(d => { this.machines = d.machines || []; }).catch(() => {});
    // SSE push: roster/feed changes arrive instantly; slow poll as fallback
    const es = new EventSource('/api/events');
    let deb;
    es.onmessage = e => {
      clearTimeout(deb);
      deb = setTimeout(() => this.poll(), 250);
      this.online = true;
    };
    es.onerror = () => { this.online = false; };
    this._timers = [setInterval(() => this.poll(), 30000)];
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.setView('feed');
    });
    matchMedia('(prefers-color-scheme: light)')
      .addEventListener('change', () => this.applyTheme());
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
  membersOf(wsId) {
    return new Set(this.agents.filter(a => a.workspace === wsId).map(a => a.address));
  },
  msgInChannel(m, wsId) {
    const mem = this.membersOf(wsId);
    return m.channel === wsId || mem.has(m.from) || mem.has(m.to);
  },
  get feed() {
    if (this.filter === 'all') return this.messages;
    if (this.filter.startsWith('chan:'))
      return this.messages.filter(m => this.msgInChannel(m, this.filter.slice(5)));
    return this.messages.filter(m =>
      (m.to === 'human' ? `${m.from}→human` : [m.from || '?', m.to].sort().join('↔')) === this.filter);
  },
  chanLabel(id) {
    return this.workspaces.find(w => w.workspace_id === id)?.label || id;
  },

  get freshFeed() {
    return this.view === 'feed' ? 0
      : this.messages.filter(m => m.ts > this.feedSeen).length;
  },

  // ---- agent detail (messaging view — no terminal tail) ----
  get selAgent() {
    return this.agents.find(a => a.address === this.sel || a.pane === this.sel) || null;
  },
  idsFor(addr) {
    /* every alias a message could use for this agent: nick and pane id */
    const a = this.agents.find(x => x.address === addr || x.pane === addr);
    return new Set([addr, a?.pane, a?.address].filter(Boolean));
  },
  get threadMsgs() {
    if (!this.sel) return [];
    const ids = this.idsFor(this.sel);
    return this.messages.filter(m => ids.has(m.from) || ids.has(m.to) || ids.has(m.to_pane));
  },
  get threadItems() {
    /* message history with day separators — chat-style chronology */
    const items = [];
    let day = '';
    for (const m of this.threadMsgs) {
      const label = dateStr(m.ts);
      if (label !== day) { day = label; items.push({ type: 'day', label }); }
      items.push({ type: 'msg', m });
    }
    return items;
  },
  get agentStats() {
    const ids = this.idsFor(this.sel);
    const t = this.threadMsgs;
    const inMsgs = t.filter(m => ids.has(m.to) || ids.has(m.to_pane));   // received by the agent
    const outMsgs = t.filter(m => ids.has(m.from));                      // sent by the agent
    const ok = inMsgs.filter(m => /delivered/.test(m.result || '')).length;
    const fails = inMsgs.filter(m => /failed|stuck|not_found/.test(m.result || '')).length;
    const peers = {};
    for (const m of t) {
      const peer = ids.has(m.from) ? m.to : m.from;
      if (peer) peers[peer] = (peers[peer] || 0) + 1;
    }
    return {
      msgs: t.length, in: inMsgs.length, out: outMsgs.length,
      ok, fails, rate: inMsgs.length ? Math.round(ok / inMsgs.length * 100) : null,
      last: t.length ? t[t.length - 1].ts : null,
      peers: Object.entries(peers).sort((a, b) => b[1] - a[1])
                   .slice(0, 5).map(([p, n]) => ({ p, n })),
    };
  },
  get selQueues() {
    if (!this.sel) return [];
    const ids = this.idsFor(this.sel);
    return this.pending.filter(qu => ids.has(qu.addr) || ids.has(qu.addr?.replace(/[:]/g, '_')));
  },
  queuedCount(a) {
    const ids = this.idsFor(a.address);
    return this.pending.filter(qu => !qu.archived &&
      (ids.has(qu.addr) || ids.has(qu.addr?.replace(/:/g, '_'))))
      .reduce((n, qu) => n + qu.msgs, 0);
  },

  // ---- helpers ----
  kindFor(addr) { return this.agents.find(a => a.address === addr)?.kind || (addr === 'human' ? 'human' : '?'); },
  kindColor(k) { return KIND[k] || '#3a3a48'; },
  kindLetters(k) { return (k === 'human' ? 'Hu' : (k || '?').slice(0, 2)); },
  hasIcon(k) { return ICONS.has(k); },
  isOk(r) { return /delivered/.test(r || ''); },
  time, dateStr,
  unreadFor(addr) {
    const seen = this.lastSeen[addr] || 0;
    const ids = this.idsFor(addr);
    return this.messages.filter(m => m.ts > seen &&
      (ids.has(m.from) || ids.has(m.to) || ids.has(m.to_pane))).length;
  },

  // ---- actions ----
  async poll() {
    try {
      const d = await (await fetch('/api/state' + (this.machine ? `?machine=${encodeURIComponent(this.machine)}` : ''))).json();
      if (d.messages.length > this.seenCount && this.notify && Notification.permission === 'granted') {
        for (const m of d.messages.slice(this.seenCount).filter(m => m.to === 'human'))
          new Notification(`hirc · ${m.from}`, { body: (m.body || '').slice(0, 120) });
      }
      this.seenCount = Math.max(this.seenCount, d.messages.length);
      localStorage.hircCount = this.seenCount;
      const el = this._feed;
      const stick = el && (el.scrollHeight - el.scrollTop - el.clientHeight < 40);
      Object.assign(this, { agents: d.agents, workspaces: d.workspaces,
                            messages: d.messages, pending: d.pending || [], me: d.me });
      this.online = true;
      document.title = `hirc${this.nBlocked ? ` (${this.nBlocked} blocked)` : ''}`;
      if (stick) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    } catch { this.online = false; }
  },
  setView(v) {
    this.view = v;
    if (v === 'feed') this.feedSeen = now();
    requestAnimationFrame(() => {
      this._feed = document.getElementById('feed');
      if (this._feed) this._feed.scrollTop = this._feed.scrollHeight;
    });
  },
  select(a) {
    this.sel = a.address; localStorage.hircSel = a.address;
    this.lastSeen[a.address] = now();
    localStorage.hircSeen = JSON.stringify(this.lastSeen);
    this.drawer = false;
    this.setView('agent');
  },
  setFilter(p) { this.filter = p; localStorage.hircFilter = p; },
  setMachine(m) {
    this.machine = m; localStorage.hircMachine = m;
    this.sel = null; this.setView('feed'); this.poll();
  },
  openChannel(g) {
    /* toggle: clicking the active channel goes back to the unfiltered feed */
    this.setFilter(this.filter === 'chan:' + g.id ? 'all' : 'chan:' + g.id);
    this.drawer = false;
    this.setView('feed');
  },
  get sysTheme() {
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  },
  get themeIcon() {
    return { light: '☀', dark: '☾', system: '◐' }[this.theme] || '◐';
  },
  applyTheme() {
    const eff = this.theme === 'system' ? this.sysTheme : this.theme;
    document.documentElement.dataset.theme = eff;
    document.documentElement.style.colorScheme = eff;
  },
  cycleTheme() {
    const order = ['dark', 'light', 'system'];
    this.theme = order[(order.indexOf(this.theme) + 1) % order.length];
    localStorage.hircTheme = this.theme;
    this.applyTheme();
  },
  async toggleBell() {
    this.notify = !this.notify;
    if (this.notify && Notification.permission !== 'granted')
      this.notify = (await Notification.requestPermission()) === 'granted';
    localStorage.hircNotify = this.notify ? '1' : '0';
  },
}).mount();
