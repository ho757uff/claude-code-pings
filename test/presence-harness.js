// Harness: simulates several VS Code windows (one extension host each) as
// child Node processes running the compiled lifecycle (out/lifecycle.js),
// against a sandbox Claude directory. Never touches the real ~/.claude.
//
// Usage: npm run compile && node test/presence-harness.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const assert = require("assert");
const { fork } = require("child_process");

const REPO = path.resolve(__dirname, "..");
// PINGS_LIFECYCLE: optional override, used to run the harness against a mutant (negative control).
const LIFECYCLE = process.env.PINGS_LIFECYCLE || path.join(REPO, "out", "lifecycle.js");

// --- Child mode: one fake extension host ---
if (process.argv[2] === "--host") {
  const claudeDir = process.argv[3];
  const lc = require(LIFECYCLE);
  lc.registerInstance(claudeDir, process.pid);
  lc.setupHooks(claudeDir, REPO);
  process.send({ ready: process.pid });
  process.on("message", (msg) => {
    if (msg === "close") {
      const last = lc.releaseInstance(claudeDir, process.pid);
      process.send({ closed: process.pid, last });
      process.exit(0);
    }
  });
  setInterval(() => {}, 1000); // stay alive like a host
  return;
}

// --- Parent mode ---
const REAL_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const VERROU = {
  hooks: [{
    type: "command",
    command: "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:/Users/theya/Desktop/iDev/Pantheon/scripts/hooks/pantheon-verrou.ps1",
  }],
};

function sha(file) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
  catch { return "<absent>"; }
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pings-harness-"));
  fs.writeFileSync(path.join(dir, "settings.json"),
    JSON.stringify({ hooks: { UserPromptSubmit: [VERROU] } }, null, 2) + "\n");
  return dir;
}

function state(claudeDir) {
  const s = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf-8"));
  const h = s.hooks || {};
  const ours = ["PreToolUse", "PermissionRequest", "Stop"].filter((t) =>
    (h[t] || []).some((e) => (e.hooks || []).some((x) => (x.command || "").includes("claude-pings"))));
  const scripts = ["on-question", "on-permission", "on-stop"].filter((n) =>
    fs.existsSync(path.join(claudeDir, "hooks", `claude-pings-${n}.ps1`)));
  return { entries: ours.length, scripts: scripts.length, verrou: h.UserPromptSubmit };
}

function assertPresent(dir, label) {
  const st = state(dir);
  assert.strictEqual(st.entries, 3, `${label}: 3 entrees attendues, ${st.entries} lues`);
  assert.strictEqual(st.scripts, 3, `${label}: 3 scripts attendus, ${st.scripts} lus`);
  assert.deepStrictEqual(st.verrou, [VERROU], `${label}: verrou altere`);
}

function assertRemoved(dir, label) {
  const st = state(dir);
  assert.strictEqual(st.entries, 0, `${label}: 0 entree attendue, ${st.entries} lues`);
  assert.strictEqual(st.scripts, 0, `${label}: 0 script attendu, ${st.scripts} lus`);
  assert.deepStrictEqual(st.verrou, [VERROU], `${label}: verrou altere`);
}

function open(dir) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ["--host", dir], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    child.once("message", (m) => (m.ready ? resolve(child) : reject(new Error("no ready"))));
    child.once("error", reject);
  });
}

function close(child) {
  return new Promise((resolve) => {
    child.once("message", (m) => resolve(m));
    child.send("close");
  }).then((m) => new Promise((r) => child.once("exit", () => r(m))));
}

function crash(child) {
  return new Promise((r) => { child.once("exit", r); child.kill("SIGKILL"); });
}

const scenarios = {
  async S1(dir) { // 2 windows, close one then the other
    const a = await open(dir); const b = await open(dir);
    assertPresent(dir, "S1 A+B ouverts");
    const ra = await close(a);
    assert.strictEqual(ra.last, false, "S1 A ne doit pas etre le dernier");
    assertPresent(dir, "S1 apres fermeture de A");
    const rb = await close(b);
    assert.strictEqual(rb.last, true, "S1 B doit etre le dernier");
    assertRemoved(dir, "S1 apres fermeture de B");
  },
  async S2(dir) { // B crashes (no deactivate), then A closes
    const a = await open(dir); const b = await open(dir);
    await crash(b);
    assertPresent(dir, "S2 apres crash de B");
    const ra = await close(a);
    assert.strictEqual(ra.last, true, "S2 A doit etre le dernier (PID de B mort)");
    assertRemoved(dir, "S2 apres fermeture de A");
  },
  async S3(dir) { // close the only window, then reopen
    const a = await open(dir);
    await close(a);
    assertRemoved(dir, "S3 apres fermeture de A");
    const b = await open(dir);
    assertPresent(dir, "S3 apres ouverture de B");
    await close(b);
    assertRemoved(dir, "S3 apres fermeture de B");
  },
  async S4(dir) { // both windows close at the same time
    const a = await open(dir); const b = await open(dir);
    const [ra, rb] = await Promise.all([close(a), close(b)]);
    assert.ok(ra.last || rb.last, "S4 au moins un hote doit demonter");
    assertRemoved(dir, "S4 apres fermeture simultanee");
  },
};

(async () => {
  const before = sha(REAL_SETTINGS);
  let failed = 0;
  for (const [name, run] of Object.entries(scenarios)) {
    const dir = sandbox();
    try {
      await run(dir);
      console.log(`PASS ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${name} : ${err.message}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const after = sha(REAL_SETTINGS);
  if (before === after) {
    console.log(`PASS temoin : ~/.claude/settings.json reel inchange (sha256 ${before.slice(0, 12)})`);
  } else {
    failed++;
    console.log(`FAIL temoin : ~/.claude/settings.json reel modifie (${before.slice(0, 12)} -> ${after.slice(0, 12)})`);
  }
  process.exit(failed ? 1 : 0);
})();
