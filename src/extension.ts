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
