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
hirc send reviewer "msg"        fire-and-forget DM
hirc send all "msg"             broadcast
hirc ask wE:p1 "question?"      send + wait + print reply
hirc send bob@workstation "hi"  remote agent via saved machine
hirc read <to> / wait <to>      inspect / block on a peer
hirc machines · log · skill
```

## Web console — http://127.0.0.1:9344

The plugin's `[[startup]]` hook runs `hirc-web`, a zero-dependency console
(Python stdlib + a single-file SPA — no build step, no node_modules):

- **Roster** grouped by workspace, live status dots
- **Feed** — every `hirc send` on this machine, including failures
- **Agent view** — click an agent to tail its live pane output
- **Compose** — you sign as `human@<host>`; agents reply with
  `hirc send 'human@<host>' "..."` and it lands in your feed

```bash
herdr plugin action invoke web --plugin hirc        # open in browser
herdr plugin action invoke web-stop --plugin hirc   # stop the daemon
```

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
