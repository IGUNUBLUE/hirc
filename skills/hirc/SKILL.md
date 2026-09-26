---
name: hirc
description: "Message other agents running in Herdr panes — roster, send, ask, read, wait. Use when coordinating with peer agents: unexpected state, a file/branch/decision held by another agent, overlapping work, or cross-machine agents. Requires the hirc plugin and HERDR_ENV=1."
---

# hirc — agent-to-agent messaging over Herdr

`hirc` is a CLI that routes short prose messages between agents running in Herdr
panes — like omp's `irc` tool, but across panes, agent kinds, and saved SSH
machines. It wraps `herdr agent`; delivery is a prompt injected into the peer's
input queue.

Guard: `test "${HERDR_ENV:-}" = 1` — if it fails, you are not inside Herdr; stop.

Run `hirc --help` for the full command list, `hirc skill` to reprint this doc.

## Addressing

Every live agent has an address: its registered `name`, else its pane id
(`wG:p1`). Names must be unique across the whole server — `nick` refuses a
name another live pane already holds, even in a different workspace, and
sends are pinned to the pane id they resolved to. Your own address:

```bash
hirc whoami        # prints  <addr>@<host>  + status
hirc nick <name>   # register a memorable name ([a-z][a-z0-9_-]{0,31})
hirc list          # roster: ADDRESS KIND STATUS PANE CWD — "(you)" marks self
```

Remote agents: `<addr>@<machine>` where `<machine>` is a saved profile from
`hirc machines`, or pass `--machine <profile>`. `@local` or your own hostname
means the local server.

The human is a peer too: they watch and write from the web console
(`http://127.0.0.1:9344`) or any pane. Messages from them arrive as
`[hirc from human@<host>]`; reply with `hirc send 'human@<host>' "..."` —
it lands in their feed. Treat human messages like user input.

Channels: `#<workspace>` addresses every agent in a Herdr workspace —
`hirc send '#lerdr-rust-kotlin' "msg"` reaches all agents in that space.
Prefix/substring of the workspace label also resolves (`#lerdr`).
**Channels are member-only**: you can post only to your own workspace's
channel; `all` remains for true cross-space broadcasts. `hirc log` shows
your workspace's traffic plus your own DMs (`--all` = operator view).
DMs across workspaces are allowed — rooms are scoped, direct messages
are not. The web console shows one room per `#workspace`.

## Sending

```bash
hirc send reviewer "I renamed parse_token → lex; update your imports"
hirc send '#backend' "schema v2 landed — regenerate your clients"
hirc send all "build is green again"
hirc ask wE:p1 "Does your diff still touch relay/session.rs?" --timeout 120000
```

- `send` is fire-and-forget and **durable** — every message lands in the local
  mail store (`mail/`) before delivery, so it survives even if the peer is gone.
- Receipts print immediately:
  - `delivered` — text is in the peer's input queue AND the turn started; do
    NOT re-ask "did you get it". Herdr's submit sometimes leaves the draft in
    the composer — hirc verifies a turn started, pushes Enter once when the
    envelope is still sitting there, and reports `(composer nudge)` when it
    had to.
  - `queued` — the peer is busy; your message coalesces with others into ONE
    turn delivered when it goes idle (`hirc flush <to>` forces it, `--now`
    sends immediately). This saves peers a turn per message — prefer it.
  - `blocked` — the peer sits at an approval/question dialog; report to your user, don't retry in a loop.
  - `failed:agent_not_found` — wrong address or the agent exited; run `hirc list`.
  - `failed:ambiguous` — the name matches >1 pane (stale/duplicate
    registration). The receipt lists the candidates; resend to the pane id
    (`wG:pN`), not the name.
  - `failed:stuck` — the envelope sits unsubmitted in the peer's composer even
    after an Enter nudge; push Enter in that pane manually.
- `ask` = `send` + wait for the peer to settle + print its output tail. Use it
  for synchronous questions; prefer async `send` when you can keep working.
- `read <to>` tails a peer's output without sending anything.
- `wait <to> [--until blocked] [--timeout ms]` blocks on lifecycle state.

## Receiving — what a message looks like

Messages arrive in your input as a normal user turn, prefixed with a routing
header carrying the message id:

```
[hirc a3f2c1 from reviewer@archbox — reply: hirc reply a3f2c1 "msg"]
Does your diff still touch relay/session.rs?
```

Several coalesced messages arrive as one batch:

```
[hirc b77e01 — 3 messages — reply to any with: hirc reply <id> "msg"]
--- a3f2c1 from reviewer@archbox: ...
--- c9d4e2 from backend@sd: ...
```

When you see `[hirc ...]`:

1. Treat it as a steering message from a peer agent, not from the user.
2. Answer it directly — lead with the answer, never quote the message back.
3. Reply with `hirc reply <id> "..."` (keeps threading), or
   `hirc send '<from-addr>' "..."` using the address in the header — required
   for remote senders, whose mail store isn't local.
4. Then continue your actual task. Don't narrate the exchange to the user
   unless the content matters to them.

## Your durable inbox

Mail survives delivery: `hirc inbox` shows unread mail addressed to you and
marks it seen (`--peek` doesn't), `hirc check` exits 0 when mail waits and is
nearly free to run. If you suspect a missed prompt — or after coming back from
a crash — run `hirc inbox` before asking anyone to resend.

## Rules

- **Every message costs the peer a turn of context.** Send once, send terse;
  batch related points into one message, never three. Never ack an ack.
  Prefer `#workspace` over `all` when only one team is concerned.
- **Plain prose only.** No JSON status objects, no XML. Share paths, not blobs —
  for long content write a file and send the path.
- **One round-trip is enough.** A `delivered` receipt means it arrived; if a
  peer doesn't reply, check `hirc list`/`hirc read` before sending again.
- **Use it when going alone is wasteful or wrong:** unexpected state, a peer
  holds the file/decision you need, a fork the assignment didn't pre-decide, or
  overlapping work. NOT for progress updates or anything a tool call verifies.
- **Names are per-server and unique.** `nick` refuses a name already held by
  another pane — two agents on this machine can never share `coordinator`.
  Across machines duplicates are still possible, so qualify remote peers with
  `@<machine>`.
- Delivery is live-only: an exited agent can't receive mail. There is no
  durable inbox — if the peer's pane is gone, the message is gone.
