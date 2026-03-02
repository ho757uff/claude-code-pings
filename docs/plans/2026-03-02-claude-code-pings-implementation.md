# Claude Code Pings - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VS Code extension that plays distinct Windows sounds when Claude Code finishes a task, asks a question, or needs permission — with no double-play bug.

**Architecture:** Minimal PowerShell hook scripts write typed signals to a file. The VS Code extension watches that file and handles all sound playback and UI. The Stop hook has a 2-second dedup guard to prevent double-play when PreToolUse or PermissionRequest hooks already fired.

**Tech Stack:** TypeScript, VS Code Extension API, PowerShell (hook scripts), `child_process.spawn` (sound playback)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`
- Create: `.gitignore`

**Step 1: Create `package.json`**

```json
{
  "name": "claude-code-pings",
  "displayName": "Claude Code Pings",
  "description": "Plays distinct sounds when Claude Code finishes a task, asks a question, or needs permission",
  "version": "1.0.0",
  "publisher": "roro",
  "repository": {
    "type": "git",
    "url": ""
  },
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "claudeCodePings.toggleSound",
        "title": "Claude Code Pings: Toggle Sound"
      }
    ],
    "configuration": {
      "title": "Claude Code Pings",
      "properties": {
        "claudeCodePings.taskCompleted.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Play a sound when Claude finishes a task."
        },
        "claudeCodePings.taskCompleted.sound": {
          "type": "string",
          "enum": [
            "Tada", "Chimes", "Chord", "Ding", "Notify",
            "Notify Email", "Notify Calendar", "Notify System",
            "Exclamation", "Ringin"
          ],
          "default": "Tada",
          "description": "Sound to play when Claude finishes a task."
        },
        "claudeCodePings.asksQuestion.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Play a sound when Claude asks you a question."
        },
        "claudeCodePings.asksQuestion.sound": {
          "type": "string",
          "enum": [
            "Tada", "Chimes", "Chord", "Ding", "Notify",
            "Notify Email", "Notify Calendar", "Notify System",
            "Exclamation", "Ringin"
          ],
          "default": "Notify Email",
          "description": "Sound to play when Claude asks a question."
        },
        "claudeCodePings.needsPermission.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Play a sound when Claude needs permission to use a tool."
        },
        "claudeCodePings.needsPermission.sound": {
          "type": "string",
          "enum": [
            "Tada", "Chimes", "Chord", "Ding", "Notify",
            "Notify Email", "Notify Calendar", "Notify System",
            "Exclamation", "Ringin"
          ],
          "default": "Notify System",
          "description": "Sound to play when Claude needs permission."
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "npx @vscode/vsce package --allow-missing-repository"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "@vscode/vsce": "^3.0.0"
  }
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "outDir": "out",
    "rootDir": "src",
    "lib": ["ES2021"],
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out"]
}
```

**Step 3: Create `.vscodeignore`**

```
.vscode/**
src/**
node_modules/**
tsconfig.json
**/*.ts
**/*.map
docs/**
.gitignore
```

**Step 4: Create `.gitignore`**

```
node_modules/
out/
*.vsix
```

**Step 5: Install dependencies**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npm install`
Expected: `node_modules/` created, no errors

**Step 6: Commit**

```bash
git add package.json tsconfig.json .vscodeignore .gitignore
git commit -m "feat: scaffold project with package.json, tsconfig, and settings schema"
```

---

### Task 2: Hook Scripts

**Files:**
- Create: `hooks/on-question.ps1`
- Create: `hooks/on-permission.ps1`
- Create: `hooks/on-stop.ps1`

**Step 1: Create `hooks/on-question.ps1`**

This hook fires on `PreToolUse` with matcher `AskUserQuestion`. It writes a `question` signal.

```powershell
# Claude Code Pings - PreToolUse hook for AskUserQuestion
# Writes a signal so the VS Code extension can play the question sound.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-pings-muted'
$signalFile = Join-Path $hooksDir 'claude-pings-signal'

# Read stdin (required by hook protocol)
$null = [Console]::In.ReadToEnd()

# Skip if muted
if (Test-Path $muteFlag) { exit 0 }

# Write signal: "question <timestamp_ms>"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Set-Content -Path $signalFile -Value "question $timestamp" -NoNewline

exit 0
```

**Step 2: Create `hooks/on-permission.ps1`**

This hook fires on `PermissionRequest`. It writes a `permission` signal. It skips `AskUserQuestion` to avoid overlap with the question hook.

```powershell
# Claude Code Pings - PermissionRequest hook
# Writes a signal so the VS Code extension can play the permission sound.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-pings-muted'
$signalFile = Join-Path $hooksDir 'claude-pings-signal'

# Read stdin
$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

# Skip if muted
if (Test-Path $muteFlag) { exit 0 }

# Skip AskUserQuestion (handled by the question hook)
if ($data.tool_name -eq 'AskUserQuestion') { exit 0 }

# Write signal: "permission <timestamp_ms>"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Set-Content -Path $signalFile -Value "permission $timestamp" -NoNewline

exit 0
```

**Step 3: Create `hooks/on-stop.ps1`**

This hook fires on `Stop`. It writes a `done` signal BUT skips if another signal was written less than 2 seconds ago (dedup guard).

```powershell
# Claude Code Pings - Stop hook (with dedup guard)
# Writes a "done" signal unless another hook already signaled recently.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-pings-muted'
$signalFile = Join-Path $hooksDir 'claude-pings-signal'

# Read stdin (required by hook protocol)
$null = [Console]::In.ReadToEnd()

# Skip if muted
if (Test-Path $muteFlag) { exit 0 }

# Dedup guard: skip if a signal was written less than 2 seconds ago
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if (Test-Path $signalFile) {
    $content = Get-Content $signalFile -Raw
    if ($content) {
        $parts = $content.Trim().Split(' ')
        if ($parts.Count -ge 2) {
            try {
                $lastTimestamp = [long]$parts[1]
                $elapsed = $now - $lastTimestamp
                if ($elapsed -lt 2000) {
                    # Another hook already signaled recently, skip
                    exit 0
                }
            } catch {}
        }
    }
}

# Write signal: "done <timestamp_ms>"
Set-Content -Path $signalFile -Value "done $now" -NoNewline

exit 0
```

**Step 4: Commit**

```bash
git add hooks/
git commit -m "feat: add PowerShell hook scripts (question, permission, stop with dedup)"
```

---

### Task 3: Extension Core - Constants and Sound Map

**Files:**
- Create: `src/extension.ts` (initial constants and sound map)

**Step 1: Create `src/extension.ts` with constants and sound map**

```typescript
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
```

**Step 2: Verify it compiles**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npx tsc -p . --noEmit`
Expected: No errors (may warn about unused variables — that's fine for now)

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add extension constants, sound map, and type definitions"
```

---

### Task 4: Extension Core - Sound Player & Signal Handler

**Files:**
- Modify: `src/extension.ts` (add playSound, handleSignal functions)

**Step 1: Add the `playSound` function after the state variables**

```typescript
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
```

**Step 2: Add the `handleSignal` function**

```typescript
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
```

**Step 3: Verify it compiles**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npx tsc -p . --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add sound playback and signal handler"
```

---

### Task 5: Extension Core - Hook Lifecycle

**Files:**
- Modify: `src/extension.ts` (add setupHooks, teardownHooks, settings helpers)

**Step 1: Add settings file helpers**

```typescript
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
```

**Step 2: Add `hookCmd` helper and `setupHooks` function**

```typescript
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
```

**Step 3: Add `teardownHooks` function**

```typescript
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
```

**Step 4: Verify it compiles**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npx tsc -p . --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add hook lifecycle (setup, teardown, settings helpers)"
```

---

### Task 6: Extension Core - activate() and deactivate()

**Files:**
- Modify: `src/extension.ts` (add activate, deactivate, status bar)

**Step 1: Add `updateStatusBar` function**

```typescript
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
```

**Step 2: Add `activate` function**

```typescript
// --- Extension entry points ---
export function activate(context: vscode.ExtensionContext): void {
  // Set up hooks in Claude's configuration
  setupHooks(context);

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
  signalWatcher = fs.watch(SIGNAL_FILE, (eventType) => {
    if (eventType === "change") {
      handleSignal();
    }
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
```

**Step 3: Add `deactivate` function**

```typescript
export function deactivate(): void {
  if (signalWatcher) {
    signalWatcher.close();
    signalWatcher = null;
  }
  teardownHooks();
}
```

**Step 4: Compile the full extension**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npx tsc -p .`
Expected: No errors, `out/extension.js` created

**Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add activate/deactivate with status bar and signal watcher"
```

---

### Task 7: Build, Package, and Install

**Files:**
- None created (build artifacts only)

**Step 1: Compile TypeScript**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npm run compile`
Expected: `out/extension.js` exists, no errors

**Step 2: Uninstall the old Claude Notifier extension**

Run: `code --uninstall-extension singularityinc.claude-notifier`
Expected: Extension uninstalled successfully

**Step 3: Verify old hooks are removed from settings.json**

Check: `~/.claude/settings.json` should no longer have `claude-notifier` entries in hooks.
If stale entries remain, manually remove them.

**Step 4: Package the extension**

Run: `cd C:\Users\theya\Desktop\iDev\claude-code-pings && npx @vscode/vsce package --allow-missing-repository`
Expected: `claude-code-pings-1.0.0.vsix` created

**Step 5: Install the extension**

Run: `code --install-extension claude-code-pings-1.0.0.vsix`
Expected: Extension installed, VS Code may need reload

**Step 6: Reload VS Code**

Reload VS Code window (`Ctrl+Shift+P` → "Developer: Reload Window")

**Step 7: Verify hooks are registered**

Check: `~/.claude/settings.json` should now have `claude-pings` entries in hooks.Stop, hooks.PermissionRequest, and hooks.PreToolUse.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: first build of Claude Code Pings v1.0.0"
```

---

### Task 8: End-to-End Testing

**Step 1: Test "Asks Question" notification**

Start a Claude Code conversation and trigger an `AskUserQuestion` tool call.
Expected: Single sound plays (Notify Email by default). No double-play.

**Step 2: Test "Needs Permission" notification**

In Claude Code, trigger a tool that requires permission (e.g., a Bash command).
Expected: Single sound plays (Notify System by default). No double-play.

**Step 3: Test "Task Completed" notification**

Let Claude finish responding to a simple prompt.
Expected: Single sound plays (Tada by default). No double-play.

**Step 4: Test mute toggle**

Click the status bar "Pings" item to mute. Trigger any event.
Expected: No sound plays. Status bar shows "Pings" with slash icon.
Click again to unmute. Trigger event. Sound plays.

**Step 5: Test per-event settings**

Open VS Code Settings, search "Claude Code Pings".
Change the Task Completed sound to "Chimes".
Trigger a task completion.
Expected: Chimes sound plays instead of Tada.

Disable "Asks Question" via the checkbox.
Trigger an AskUserQuestion.
Expected: No sound plays for questions. Other events still play.

**Step 6: Document any issues found and fix them**

If any test fails, debug and fix the issue before proceeding.
