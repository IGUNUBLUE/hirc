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
(`wG:p1`). Your own address:

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

## Sending

```bash
hirc send reviewer "I renamed parse_token → lex; update your imports"
hirc send all "schema v2 landed — regenerate your clients"
hirc ask wE:p1 "Does your diff still touch relay/session.rs?" --timeout 120000
```

- `send` is fire-and-forget. Receipts print immediately:
  - `delivered` — text is in the peer's input queue; do NOT re-ask "did you get it".
  - `blocked` — the peer sits at an approval/question dialog; report to your user, don't retry in a loop.
  - `failed:agent_not_found` — wrong address or the agent exited; run `hirc list`.
- Messaging a `working` agent queues your text for its next turn — that IS the
  wake mechanism. Messaging `idle`/`done` agents works the same way.
- `ask` = `send` + wait for the peer to settle + print its output tail. Use it
  for synchronous questions; prefer async `send` when you can keep working.
- `read <to>` tails a peer's output without sending anything.
- `wait <to> [--until blocked] [--timeout ms]` blocks on lifecycle state.

## Receiving — what a message looks like

Messages arrive in your input as a normal user turn, prefixed with a routing
header:

```
[hirc from reviewer@archbox — reply: hirc send 'reviewer@archbox' "msg"]
Does your diff still touch relay/session.rs?
```

When you see `[hirc from <addr>]`:

1. Treat it as a steering message from a peer agent, not from the user.
2. Answer it directly — lead with the answer, never quote the message back.
3. Reply with `hirc send '<addr>' "..."` using the exact `from` address.
   For a remote sender, pick the profile in `hirc machines` that points back at
   their host; if none exists, tell your user the reply path is missing.
4. Then continue your actual task. Don't narrate the exchange to the user
   unless the content matters to them.

## Rules

- **Plain prose only.** No JSON status objects, no XML. Share paths, not blobs —
  for long content write a file and send the path.
- **One round-trip is enough.** A `delivered` receipt means it arrived; if a
  peer doesn't reply, check `hirc list`/`hirc read` before sending again.
- **Use it when going alone is wasteful or wrong:** unexpected state, a peer
  holds the file/decision you need, a fork the assignment didn't pre-decide, or
  overlapping work. NOT for progress updates or anything a tool call verifies.
- **Names are per-server.** Two machines can both host a `reviewer` — always
  qualify with `@<machine>` when it's not local.
- Delivery is live-only: an exited agent can't receive mail. There is no
  durable inbox — if the peer's pane is gone, the message is gone.
