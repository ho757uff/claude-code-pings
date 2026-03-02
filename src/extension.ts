import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

// --- Paths ---
const HOME = process.env.USERPROFILE || process.env.HOME || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-pings-signal");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-pings-muted");

// Hook file destinations in ~/.claude/hooks/
const HOOK_QUESTION = path.join(HOOKS_DIR, "claude-pings-on-question.ps1");
const HOOK_PERMISSION = path.join(HOOKS_DIR, "claude-pings-on-permission.ps1");
const HOOK_STOP = path.join(HOOKS_DIR, "claude-pings-on-stop.ps1");

// --- Sound Map: display name → Windows file path ---
const SOUND_MAP: Record<string, string> = {
  "Tada": "C:\\Windows\\Media\\tada.wav",
  "Chimes": "C:\\Windows\\Media\\chimes.wav",
  "Chord": "C:\\Windows\\Media\\chord.wav",
  "Ding": "C:\\Windows\\Media\\ding.wav",
  "Notify": "C:\\Windows\\Media\\notify.wav",
  "Notify Email": "C:\\Windows\\Media\\Windows Notify Email.wav",
  "Notify Calendar": "C:\\Windows\\Media\\Windows Notify Calendar.wav",
  "Notify System": "C:\\Windows\\Media\\Windows Notify System Generic.wav",
  "Exclamation": "C:\\Windows\\Media\\Windows Exclamation.wav",
  "Ringin": "C:\\Windows\\Media\\Windows Ringin.wav",
};

// Event type → settings key mapping
type EventType = "question" | "permission" | "done";
const EVENT_CONFIG: Record<EventType, { enabledKey: string; soundKey: string; defaultSound: string }> = {
  question: { enabledKey: "asksQuestion.enabled", soundKey: "asksQuestion.sound", defaultSound: "Notify Email" },
  permission: { enabledKey: "needsPermission.enabled", soundKey: "needsPermission.sound", defaultSound: "Notify System" },
  done: { enabledKey: "taskCompleted.enabled", soundKey: "taskCompleted.sound", defaultSound: "Tada" },
};

// --- Extension state ---
let statusBarItem: vscode.StatusBarItem;
let signalWatcher: fs.FSWatcher | null = null;
let soundEnabled = true;
let lastSignalContent = "";

// --- Sound playback ---
function playSound(soundName: string): void {
  const wavPath = SOUND_MAP[soundName];
  if (!wavPath) {
    console.error(`Claude Code Pings: Unknown sound "${soundName}"`);
    return;
  }

  const ps = spawn("powershell", [
    "-NoProfile",
    "-NoLogo",
    "-Command",
    `(New-Object System.Media.SoundPlayer '${wavPath}').PlaySync()`,
  ], {
    stdio: "ignore",
    windowsHide: true,
  });

  ps.on("error", (err) => {
    console.error("Claude Code Pings: Sound playback failed:", err.message);
  });

  ps.unref();
}

// --- Signal handling ---
function handleSignal(): void {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  // Skip if content hasn't changed (debounce duplicate fs.watch events)
  if (content === lastSignalContent) {
    return;
  }
  lastSignalContent = content;

  // Parse signal: "<event> <timestamp>"
  const eventType = content.split(" ")[0] as EventType;
  const config = EVENT_CONFIG[eventType];
  if (!config) {
    return;
  }

  // Check if this event is enabled and sound is not globally muted
  if (!soundEnabled) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration("claudeCodePings");
  const enabled = cfg.get<boolean>(config.enabledKey, true);
  if (!enabled) {
    return;
  }

  const soundName = cfg.get<string>(config.soundKey, config.defaultSound);
  playSound(soundName);
}

// --- Claude settings.json helpers ---
function readClaudeSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeClaudeSettings(settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

function hookCmd(hookPath: string): string {
  return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"`;
}

// --- Hook lifecycle ---
function setupHooks(context: vscode.ExtensionContext): void {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy bundled hook scripts to ~/.claude/hooks/ (only if content differs)
  const hookFiles: Array<[string, string]> = [
    ["on-question.ps1", HOOK_QUESTION],
    ["on-permission.ps1", HOOK_PERMISSION],
    ["on-stop.ps1", HOOK_STOP],
  ];

  for (const [bundled, dest] of hookFiles) {
    const src = path.join(context.extensionPath, "hooks", bundled);
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
  const settings = readClaudeSettings() as Record<string, unknown>;
  const hooks = (settings.hooks || {}) as Record<string, unknown[]>;

  const hasHook = (type: string, needle: string): boolean => {
    const entries = hooks[type] as Array<{ hooks?: Array<{ command?: string }> }> | undefined;
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
  for (const hookType of ["Stop", "PermissionRequest", "PreToolUse"]) {
    if (hooks[hookType]) {
      hooks[hookType] = (hooks[hookType] as Array<{ hooks?: Array<{ command?: string }> }>).filter(
        (entry) => !entry.hooks?.some((h) => h.command?.includes("claude-pings"))
      );
      if ((hooks[hookType] as unknown[]).length === 0) {
        delete hooks[hookType];
      }
    }
  }

  // Register PreToolUse hook for AskUserQuestion
  if (!hooks.PreToolUse) { hooks.PreToolUse = []; }
  (hooks.PreToolUse as unknown[]).push({
    matcher: "AskUserQuestion",
    hooks: [{ type: "command", command: hookCmd(HOOK_QUESTION) }],
  });

  // Register PermissionRequest hook
  if (!hooks.PermissionRequest) { hooks.PermissionRequest = []; }
  (hooks.PermissionRequest as unknown[]).push({
    hooks: [{ type: "command", command: hookCmd(HOOK_PERMISSION) }],
  });

  // Register Stop hook
  if (!hooks.Stop) { hooks.Stop = []; }
  (hooks.Stop as unknown[]).push({
    hooks: [{ type: "command", command: hookCmd(HOOK_STOP) }],
  });

  settings.hooks = hooks;
  writeClaudeSettings(settings);
}

function teardownHooks(): void {
  // Remove hook files
  for (const file of [HOOK_QUESTION, HOOK_PERMISSION, HOOK_STOP, SIGNAL_FILE, MUTE_FLAG]) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }

  // Remove hook entries from Claude's settings.json
  const settings = readClaudeSettings() as Record<string, unknown>;
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) { return; }

  for (const hookType of ["Stop", "PermissionRequest", "PreToolUse"]) {
    if (hooks[hookType]) {
      hooks[hookType] = (hooks[hookType] as Array<{ hooks?: Array<{ command?: string }> }>).filter(
        (entry) => !entry.hooks?.some((h) => h.command?.includes("claude-pings"))
      );
      if ((hooks[hookType] as unknown[]).length === 0) {
        delete hooks[hookType];
      }
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }
  writeClaudeSettings(settings);
}
