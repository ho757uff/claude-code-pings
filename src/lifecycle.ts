// Hook lifecycle for Claude Code Pings — no dependency on the `vscode` module,
// so it can be exercised by a plain Node harness against a sandbox directory.
import * as fs from "fs";
import * as path from "path";

export interface ClaudePaths {
  hooksDir: string;
  settingsFile: string;
  signalFile: string;
  muteFlag: string;
  claimFile: string;
  hookQuestion: string;
  hookPermission: string;
  hookStop: string;
}

export function claudePaths(claudeDir: string): ClaudePaths {
  const hooksDir = path.join(claudeDir, "hooks");
  return {
    hooksDir,
    settingsFile: path.join(claudeDir, "settings.json"),
    signalFile: path.join(hooksDir, "claude-pings-signal"),
    muteFlag: path.join(hooksDir, "claude-pings-muted"),
    claimFile: path.join(hooksDir, "claude-pings-claim"),
    hookQuestion: path.join(hooksDir, "claude-pings-on-question.ps1"),
    hookPermission: path.join(hooksDir, "claude-pings-on-permission.ps1"),
    hookStop: path.join(hooksDir, "claude-pings-on-stop.ps1"),
  };
}

type HookEntry = { hooks?: Array<{ command?: string }> };

// --- Claude settings.json helpers ---
function readClaudeSettings(settingsFile: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
  } catch {
    return {};
  }
}

function writeClaudeSettings(settingsFile: string, settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
}

function hookCmd(hookPath: string): string {
  return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"`;
}

function removeOurEntries(hooks: Record<string, unknown[]>): void {
  for (const hookType of ["Stop", "PermissionRequest", "PreToolUse"]) {
    if (hooks[hookType]) {
      hooks[hookType] = (hooks[hookType] as HookEntry[]).filter(
        (entry) => !entry.hooks?.some((h) => h.command?.includes("claude-pings"))
      );
      if ((hooks[hookType] as unknown[]).length === 0) {
        delete hooks[hookType];
      }
    }
  }
}

// --- Hook lifecycle ---
export function setupHooks(claudeDir: string, extensionPath: string): void {
  const p = claudePaths(claudeDir);
  fs.mkdirSync(p.hooksDir, { recursive: true });

  // Copy bundled hook scripts to ~/.claude/hooks/ (only if content differs)
  const hookFiles: Array<[string, string]> = [
    ["on-question.ps1", p.hookQuestion],
    ["on-permission.ps1", p.hookPermission],
    ["on-stop.ps1", p.hookStop],
  ];

  for (const [bundled, dest] of hookFiles) {
    const src = path.join(extensionPath, "hooks", bundled);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent = "";
    try {
      destContent = fs.readFileSync(dest, "utf-8");
    } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent);
    }
  }

  // Register hooks in Claude's settings.json (if not already registered)
  const settings = readClaudeSettings(p.settingsFile);
  const hooks = (settings.hooks || {}) as Record<string, unknown[]>;

  const hasHook = (type: string, needle: string): boolean => {
    const entries = hooks[type] as HookEntry[] | undefined;
    return entries?.some((entry) =>
      entry.hooks?.some((h) => h.command?.includes(needle))
    ) ?? false;
  };

  // Skip if all our hooks are already registered
  if (
    hasHook("PreToolUse", "claude-pings-on-question") &&
    hasHook("PermissionRequest", "claude-pings-on-permission") &&
    hasHook("Stop", "claude-pings-on-stop")
  ) {
    return;
  }

  // Remove any stale claude-pings entries first
  removeOurEntries(hooks);

  // Register PreToolUse hook for AskUserQuestion
  if (!hooks.PreToolUse) { hooks.PreToolUse = []; }
  (hooks.PreToolUse as unknown[]).push({
    matcher: "AskUserQuestion",
    hooks: [{ type: "command", command: hookCmd(p.hookQuestion) }],
  });

  // Register PermissionRequest hook
  if (!hooks.PermissionRequest) { hooks.PermissionRequest = []; }
  (hooks.PermissionRequest as unknown[]).push({
    hooks: [{ type: "command", command: hookCmd(p.hookPermission) }],
  });

  // Register Stop hook
  if (!hooks.Stop) { hooks.Stop = []; }
  (hooks.Stop as unknown[]).push({
    hooks: [{ type: "command", command: hookCmd(p.hookStop) }],
  });

  settings.hooks = hooks;
  writeClaudeSettings(p.settingsFile, settings);
}

// --- Instance registry ---
// Each VS Code window runs its own extension host. Each host registers a file
// named after its PID; hooks are torn down only when the last live host leaves.

function instancesDir(claudeDir: string): string {
  return path.join(claudePaths(claudeDir).hooksDir, "claude-pings-instances");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but we may not signal it.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function registerInstance(claudeDir: string, pid: number): void {
  const dir = instancesDir(claudeDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, String(pid)), "");
}

/**
 * Unregisters this host. Tears hooks down only if no other live host remains.
 * Returns true when this host was the last one (hooks removed).
 */
export function releaseInstance(claudeDir: string, pid: number): boolean {
  const dir = instancesDir(claudeDir);
  // Remove our own entry BEFORE listing: if two hosts close at the same time,
  // at least one of them sees an empty registry and tears down.
  try { fs.unlinkSync(path.join(dir, String(pid))); } catch {}

  let others: string[] = [];
  try { others = fs.readdirSync(dir); } catch {}

  let liveOthers = 0;
  for (const name of others) {
    const other = Number(name);
    if (Number.isInteger(other) && other > 0 && isAlive(other)) {
      liveOthers++;
    } else {
      // Dead host (crash, killed window) or junk entry: purge it.
      try { fs.unlinkSync(path.join(dir, name)); } catch {}
    }
  }

  if (liveOthers > 0) {
    return false;
  }

  teardownHooks(claudeDir);
  try { fs.rmdirSync(dir); } catch {}
  return true;
}

export function teardownHooks(claudeDir: string): void {
  const p = claudePaths(claudeDir);

  // Remove hook files
  for (const file of [p.hookQuestion, p.hookPermission, p.hookStop, p.signalFile, p.muteFlag, p.claimFile]) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }

  // Remove hook entries from Claude's settings.json
  const settings = readClaudeSettings(p.settingsFile);
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) { return; }

  removeOurEntries(hooks);

  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }
  writeClaudeSettings(p.settingsFile, settings);
}
