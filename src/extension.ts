import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { registerInstance, releaseInstance, setupHooks } from "./lifecycle";

// --- Paths ---
const HOME = process.env.USERPROFILE || process.env.HOME || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-pings-signal");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-pings-muted");
const CLAIM_FILE = path.join(HOOKS_DIR, "claude-pings-claim");

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
  question: { enabledKey: "asksQuestion.enabled", soundKey: "asksQuestion.sound", defaultSound: "Chord" },
  permission: { enabledKey: "needsPermission.enabled", soundKey: "needsPermission.sound", defaultSound: "Notify System" },
  done: { enabledKey: "taskCompleted.enabled", soundKey: "taskCompleted.sound", defaultSound: "Tada" },
};

// --- Extension state ---
let statusBarItem: vscode.StatusBarItem;
let signalWatcher: fs.FSWatcher | null = null;
let soundPlayer: ReturnType<typeof spawn> | null = null;
let soundEnabled = true;
let lastSignalContent = "";

// --- Persistent sound player ---
// A single PowerShell process stays alive and plays sounds on demand via stdin.
// Uses winmm.dll PlaySound instead of System.Media.SoundPlayer to avoid
// Windows audio ducking — PlaySound uses the System Sounds mixer channel
// which is not subject to communication-activity volume reduction.
function ensureSoundPlayer(): ReturnType<typeof spawn> | null {
  if (soundPlayer && soundPlayer.exitCode === null) {
    return soundPlayer;
  }

  soundPlayer = spawn("powershell", [
    "-NoProfile",
    "-NoLogo",
    "-Command",
    "Add-Type -MemberDefinition '[DllImport(\"winmm.dll\")] public static extern bool PlaySound(string fname, IntPtr hmod, uint fdwSound);' -Namespace Win32 -Name Sound; while ($line = [Console]::ReadLine()) { if ($line -and (Test-Path $line)) { [Win32.Sound]::PlaySound($line, [IntPtr]::Zero, 0x20002) } }",
  ], {
    stdio: ["pipe", "ignore", "ignore"],
    windowsHide: true,
  });

  soundPlayer.on("error", (err) => {
    console.error("Claude Code Pings: Sound player failed:", err.message);
    soundPlayer = null;
  });

  soundPlayer.on("exit", () => {
    soundPlayer = null;
  });

  return soundPlayer;
}

function playSound(soundName: string): void {
  const wavPath = SOUND_MAP[soundName];
  if (!wavPath) {
    console.error(`Claude Code Pings: Unknown sound "${soundName}"`);
    return;
  }

  const player = ensureSoundPlayer();
  if (player && player.stdin && player.stdin.writable) {
    player.stdin.write(wavPath + "\n");
  }
}

// --- Signal handling ---
let signalDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function handleSignal(): void {
  // Debounce: wait 50ms for the file write to complete before reading.
  // On Windows, fs.watch can fire mid-write (after truncation, before content).
  if (signalDebounceTimer) {
    clearTimeout(signalDebounceTimer);
  }
  signalDebounceTimer = setTimeout(() => {
    signalDebounceTimer = null;
    processSignal();
  }, 50);
}

function processSignal(): void {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  if (!content) {
    return;
  }

  // In-memory dedup (same instance, duplicate fs.watch events)
  if (content === lastSignalContent) {
    return;
  }
  lastSignalContent = content;

  // Parse signal: "<event> <timestamp>"
  const parts = content.split(" ");
  if (parts.length < 2) {
    return;
  }
  const eventType = parts[0] as EventType;
  const timestamp = parts[1];

  // Cross-instance dedup: check if another VS Code window already claimed this signal.
  // Each instance watches the same signal file, but only the first to claim should play.
  try {
    const claimed = fs.readFileSync(CLAIM_FILE, "utf-8").trim();
    if (claimed === timestamp) {
      return;
    }
  } catch {
    // Claim file doesn't exist yet — we're first
  }

  // Claim this signal for our instance
  try {
    fs.writeFileSync(CLAIM_FILE, timestamp);
  } catch {}

  const config = EVENT_CONFIG[eventType];
  if (!config) {
    return;
  }

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

// --- Status bar ---
function updateStatusBar(): void {
  if (soundEnabled) {
    statusBarItem.text = "$(bell) Pings";
    statusBarItem.tooltip = "Claude Code Pings — sound ON (click to mute)";
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(bell-slash) Pings";
    statusBarItem.tooltip = "Claude Code Pings — sound OFF (click to unmute)";
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
}

// --- Extension entry points ---
export function activate(context: vscode.ExtensionContext): void {
  // Set up hooks in Claude's configuration
  // Register this window (extension host) before installing, so a window
  // closing concurrently does not tear down under our feet.
  registerInstance(CLAUDE_DIR, process.pid);
  setupHooks(CLAUDE_DIR, context.extensionPath);

  // Initialize mute state from flag file
  soundEnabled = !fs.existsSync(MUTE_FLAG);

  // Create signal file if it doesn't exist
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "claudeCodePings.toggleSound";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand("claudeCodePings.toggleSound", () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      try { fs.unlinkSync(MUTE_FLAG); } catch {}
    } else {
      fs.writeFileSync(MUTE_FLAG, "");
    }
    updateStatusBar();
    vscode.window.showInformationMessage(
      `Claude Code Pings: sound ${soundEnabled ? "ON" : "OFF"}`
    );
  });
  context.subscriptions.push(toggleCmd);

  // Watch signal file for changes
  // On Windows, fs.watch may fire "rename" instead of "change" for overwrites,
  // so we handle both event types. The debounce in handleSignal prevents duplicates.
  signalWatcher = fs.watch(SIGNAL_FILE, () => {
    handleSignal();
  });
  context.subscriptions.push({
    dispose: () => {
      if (signalWatcher) {
        signalWatcher.close();
        signalWatcher = null;
      }
    },
  });
}

export function deactivate(): void {
  if (signalWatcher) {
    signalWatcher.close();
    signalWatcher = null;
  }
  if (soundPlayer) {
    soundPlayer.kill();
    soundPlayer = null;
  }
  // Remove hooks only if this was the last open window.
  releaseInstance(CLAUDE_DIR, process.pid);
}
