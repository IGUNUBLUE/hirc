#!/usr/bin/env python3
"""hirc CLI tests against a fake `herdr` shim — no live Herdr needed.

Run: python3 tests/test_hirc.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HIRC = str(Path(__file__).resolve().parent.parent / "bin" / "hirc")

ROSTER = [
    {"name": "alice", "pane_id": "w1:p1", "agent": "devin", "agent_status": "idle", "workspace_id": "wA", "cwd": "/a"},
    {"name": "bob", "pane_id": "w1:p2", "agent": "codex", "agent_status": "working", "workspace_id": "wA", "cwd": "/a"},
    {"name": "carol", "pane_id": "w2:p1", "agent": "claude", "agent_status": "idle", "workspace_id": "wB", "cwd": "/b"},
    {"name": "selfy", "pane_id": "w1:p9", "agent": "devin", "agent_status": "working", "workspace_id": "wA", "cwd": "/a"},
    # same name in two workspaces — addresses must not silently misroute
    {"name": "dupe", "pane_id": "w9:p1", "agent": "devin", "agent_status": "idle", "workspace_id": "wC", "cwd": "/c"},
    {"name": "dupe", "pane_id": "w9:p2", "agent": "codex", "agent_status": "idle", "workspace_id": "wC", "cwd": "/c"},
]
WORKSPACES = [{"workspace_id": "wA", "label": "space-a"}, {"workspace_id": "wB", "label": "space-b"}]

SHIM = """#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
home = os.environ['HOME']
def flag(n):
    return os.path.exists(os.path.join(home, n))
def touch(n):
    open(os.path.join(home, n), 'w').write('1')
if a[:2] == ['agent', 'list']:
    print(json.dumps({"result": {"agents": %s}}))
elif a[:2] == ['workspace', 'list']:
    print(json.dumps({"result": {"workspaces": %s}}))
elif a[:2] == ['agent', 'prompt']:
    open(os.path.join(home, 'lastprompt'), 'w').write(a[3])
    print(json.dumps({"result": {"ok": True}}))
elif a[:2] == ['agent', 'wait']:
    # simulate a TUI that swallowed Enter: wait times out until a nudge lands
    if os.environ.get('HIRC_SHIM_STUCK') and not flag('nudged'):
        print(json.dumps({"error": {"code": "timeout", "message": "timed out"}}))
    else:
        print(json.dumps({"result": {}}))
elif a[:2] == ['agent', 'send-keys']:
    touch('nudged')
    print(json.dumps({"result": {"ok": True}}))
elif a[:2] == ['agent', 'read']:
    screen = os.environ.get('HIRC_SHIM_SCREEN')
    if screen is None:
        lp = open(os.path.join(home, 'lastprompt')).read() if flag('lastprompt') else ''
        screen = "❭ " + lp          # the envelope still sits on the input line
    sys.stdout.write(screen)
elif a[:2] == ['agent', 'rename']:
    print(json.dumps({"result": {"name": a[3]}}))
elif a[:2] == ['agent', 'get']:
    print(json.dumps({"result": {"pane_id": a[2]}}))
elif a[:2] == ['machine', 'list']:
    print(json.dumps({"result": []}))
else:
    print(json.dumps({"result": {}}))
""" % (json.dumps(ROSTER), json.dumps(WORKSPACES))


class Hirc(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        (t / "bin").mkdir()
        (t / "bin" / "herdr").write_text(SHIM)
        (t / "bin" / "herdr").chmod(0o755)
        self.state = t / "state"
        self.env = dict(os.environ,
                        PATH=f"{t}/bin:{os.environ['PATH']}",
                        HERDR_PANE_ID="w1:p9",
                        HOME=str(t))
        # point hirc's state dir at the sandbox
        self.env["XDG_STATE_HOME"] = str(self.state)
        self.hirc_state = t / ".local" / "state" / "herdr" / "plugins" / "hirc"
        os.makedirs(self.hirc_state, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def cli(self, *args, env_extra=None):
        env = dict(self.env, **(env_extra or {}))
        return subprocess.run([HIRC, *args], capture_output=True, text=True, env=env)

    def mail(self):
        d = self.hirc_state / "mail"
        if not d.exists():
            return []
        out = []
        for f in d.glob("out-*.jsonl"):
            out += [json.loads(l) for l in f.read_text().splitlines()]
        return out

    def test_send_idle_delivers_and_mails(self):
        r = self.cli("send", "alice", "hi")
        self.assertIn("delivered → alice", r.stdout)
        self.assertEqual(self.mail()[-1]["to"], "alice")

    def test_send_busy_queues_for_coalescing(self):
        r = self.cli("send", "bob", "one")
        self.assertIn("queued → bob", r.stdout)
        r = self.cli("send", "bob", "two")
        self.assertIn("queued → bob", r.stdout)
        pend = self.hirc_state / "pending" / "w1_p2.jsonl"   # keyed by pane id
        self.assertEqual(len(pend.read_text().splitlines()), 2)
        r = self.cli("flush", "bob")
        self.assertIn("delivered → bob (2 msg)", r.stdout)
        self.assertFalse(pend.exists())

    def test_channel_member_only(self):
        # me is in wA; #space-b is not mine
        r = self.cli("send", "#space-b", "hello")
        self.assertIn("not a member", r.stderr)
        r = self.cli("send", "#space-a", "team")
        self.assertIn("delivered → alice", r.stdout)   # bob busy → queued
        self.assertIn("queued → bob", r.stdout)
        self.assertNotIn("selfy", r.stdout)               # never sent to self

    def test_inbox_watermark(self):
        self.cli("send", "selfy", "note-to-self")      # selfy is working → queued
        self.cli("flush", "selfy")
        r = self.cli("inbox", "--peek")
        self.assertIn("note-to-self", r.stdout)
        self.cli("inbox")                                # marks seen
        r = self.cli("check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("no new mail", r.stdout)

    def test_reply_resolves_sender(self):
        self.cli("send", "alice", "ping")
        mid = self.mail()[-1]["id"]
        r = self.cli("reply", mid, "pong")
        self.assertIn("selfy", r.stdout)  # reply goes back to the sender
        self.assertEqual(self.mail()[-1].get("reply_to"), mid)

    def test_ambiguous_name_refused(self):
        r = self.cli("send", "dupe", "hi")
        self.assertIn("failed:ambiguous", r.stdout)
        self.assertIn("w9:p1", r.stdout)
        self.assertIn("w9:p2", r.stdout)

    def test_pane_id_routes_despite_dup_name(self):
        r = self.cli("send", "w9:p2", "hi")
        self.assertIn("delivered → w9:p2", r.stdout)

    def test_nick_refuses_taken_name(self):
        r = self.cli("nick", "dupe")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("taken", r.stderr)

    def test_stuck_composer_gets_nudge(self):
        env = {"HIRC_SHIM_STUCK": "1"}
        r = self.cli("send", "alice", "hi", env_extra=env)
        self.assertIn("delivered → alice", r.stdout)
        self.assertIn("composer nudge", r.stdout)
        self.assertTrue((Path(self.env["HOME"]) / "nudged").exists())

    def test_no_draft_on_screen_reports_unverified(self):
        env = {"HIRC_SHIM_STUCK": "1", "HIRC_SHIM_SCREEN": "just an idle prompt"}
        r = self.cli("send", "alice", "hi", env_extra=env)
        self.assertIn("unverified", r.stdout)
        self.assertFalse((Path(self.env["HOME"]) / "nudged").exists())

    def test_reply_pins_to_pane_id(self):
        self.cli("send", "alice", "ping")
        mid = self.mail()[-1]["id"]
        r = self.cli("reply", mid, "pong")
        self.assertIn("selfy", r.stdout)   # selfy is working → queued
        m = self.mail()[-1]
        self.assertEqual(m.get("to_pane"), "w1:p9")
        pend = self.hirc_state / "pending" / "w1_p9.jsonl"
        self.assertTrue(pend.exists())   # queued under the pane-id key

    def test_log_scoping(self):
        self.cli("send", "alice", "dm")
        self.cli("send", "#space-a", "chan")
        out = self.cli("log", "--all").stdout
        self.assertIn("→ alice", out)
        self.assertIn("→ bob", out)


if __name__ == "__main__":
    unittest.main(verbosity=1)
