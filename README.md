# hirc — agent IRC for Herdr

IRC-style messaging between agents running in [Herdr](https://herdr.dev) panes —
inspired by omp's built-in `irc` tool, but across panes, agent kinds
(claude, codex, devin, gemini, omp, …) and saved SSH machines.

## Install

```bash
herdr plugin link /path/to/hirc        # local checkout
herdr plugin install <owner>/<repo>    # once published
```

The build step symlinks `hirc` into `~/.local/bin` and installs
`skills/hirc/SKILL.md` into every detected agent skill directory
(`~/.config/devin/skills`, `~/.claude/skills`, `~/.agents/skills`, …) so agents
learn the protocol automatically. Agents without skill support can run
`hirc skill` to print the same doc.

## Usage

```
hirc whoami                     your address + status
hirc nick backend-api           register a memorable name
hirc list                       roster of live agents
hirc send reviewer "msg"        fire-and-forget DM (durable — lands in mail/)
hirc send '#workspace' "msg"    channel: every agent in that workspace
                                (member-only; agents can't post to other spaces)
hirc send all "msg"             broadcast to everyone (costs each a turn)
hirc reply <id> "msg"           reply by message id (threads the conversation)
hirc inbox / check              durable unread mail / cheap "new mail?" probe
hirc flush [to] [--if-idle]     deliver coalesced queues
hirc ask wE:p1 "question?"      send + wait + print reply
hirc send bob@workstation "hi"  remote agent via saved machine
hirc read <to> / wait <to>      inspect / block on a peer
hirc machines · log · stats · skill · mcp
```

**Delivery semantics.** Messages to a `working`/`blocked` peer don't interrupt:
they queue in `pending/` and flush as a single coalesced turn when the peer
goes idle (the web daemon watches `pane.agent_status_changed` on the Herdr
socket, plus a periodic sweep for panes already idle). `--now` overrides.
Every message is appended to a per-sender append-only log (`mail/`) before
delivery — that's the durable inbox `hirc inbox` reads.

**MCP.** `hirc mcp` serves the whole CLI as MCP tools over stdio —
`{"command": "hirc", "args": ["mcp"]}` in any MCP-capable client.

## First use — onboard your agents

Agents installed after the plugin get the skill automatically; for sessions
already running (or harnesses without skill support), paste this into each
agent's input once:

```
You can message the other agents in this Herdr session via the `hirc` CLI
(if not on PATH: ~/.local/bin/hirc).

1. `hirc whoami` shows your address; `hirc nick <name>` sets a short
   memorable name (e.g. backend, reviewer).
2. `hirc list` shows all live agents and their addresses.
3. Send: `hirc send <addr> "message"` (fire-and-forget).
   Ask and wait: `hirc ask <addr> "question"`.
4. Incoming messages arrive prefixed `[hirc from <addr> — reply: ...]` —
   they are peer messages: answer directly with `hirc send '<addr>' "..."`,
   don't quote them, then continue your task.
5. Full protocol: `hirc skill`. Keep messages terse prose; coordinate when
   blocked, when work overlaps, or when a decision isn't yours.
```

Then kick off introductions from one session:

```
hirc nick <your-name>, then `hirc send all "Hi, I'm <name>, working on
<task>. Who are you?"` — and reply to whoever answers.
```

## Web console — http://127.0.0.1:9344

![hirc web console — workspace channels, live feed, agent roster](docs/mockup.svg)

The plugin's `[[startup]]` hook runs `hirc-web`, a zero-dependency console
(Python stdlib + a single-file SPA — no build step, no node_modules):

- **Channels** — each workspace is a `#channel`: click the space header to
  see that team's room (member traffic + channel broadcasts); composer
  pre-fills `#<label>` so you can address the whole space
- **Roster** grouped by workspace with per-CLI logo badges (SVG marks from
  [herdr-radar](https://github.com/hhdebb/herdr-radar), MIT), live status dots
- **Feed** — every `hirc send` on this machine, including failures; DM-pair
  chips for private conversations
- **Agent view** — click an agent to tail its live pane output
- **Compose** — you sign as `human@<host>`; agents reply with
  `hirc send 'human@<host>' "..."` and it lands in your feed

```bash
herdr plugin action invoke web --plugin hirc        # open in browser
herdr plugin action invoke web-stop --plugin hirc   # stop the daemon
```

The daemon binds `127.0.0.1` only. The port is fixed at 9344 — override with
`HIRC_PORT` (honored by `hirc-web`, `web-daemon.sh`, and `web-open.sh`). If the
port is taken, the daemon fails to start rather than picking another one.

## Wire format

Messages are injected into the recipient's input queue with a routing header:

```
[hirc from reviewer@archbox — reply: hirc send 'reviewer@archbox' "msg"]
Should I prefer JWT or session cookies?
```

The header makes the message self-documenting: even an agent without the skill
can see who sent it and how to reply.

## Plugin surface

- `herdr plugin action invoke roster --plugin hirc` — live roster popup
- `herdr plugin action invoke message-log --plugin hirc` — send/delivery log
- `herdr plugin action invoke install-skills --plugin hirc` — re-run install
- `herdr plugin action invoke uninstall --plugin hirc` — remove CLI + skills

## Semantics

- `delivered` means the text is in the peer's input queue — never re-ask.
- `blocked` means the peer is at an approval dialog; surface it, don't retry.
- Live delivery only — no durable mailbox (same as omp's IRC).
