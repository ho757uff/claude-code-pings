# Claude Code Pings - Design Document

**Date:** 2026-03-02
**Status:** Approved
**Author:** Roro + Claude

## Problem

The existing "Claude Notifier" VS Code extension (v2.1.0 by SingularityInc) has two bugs on Windows:

1. **Wrong sound:** The settings dropdown mixes macOS and Windows sound names. Selecting macOS names (Pop, Submarine, Hero) on Windows silently falls back to defaults because the hook scripts only map Windows sound names to file paths.
2. **Double play:** The `AskUserQuestion` event triggers both the `PreToolUse` hook AND the `Stop` hook (which also detects questions by reading the transcript). Similarly, `PermissionRequest` triggers both its dedicated hook and the `Stop` hook.

## Solution

Build a new VS Code extension called **Claude Code Pings** that:
- Only shows Windows-compatible sounds in settings (MVP)
- Eliminates double-play by making hook scripts signal-only and centralizing all presentation logic in the extension
- Uses a deduplication guard in the Stop hook to skip if another hook already signaled recently

## Architecture

```
Claude Code hooks (3 PowerShell scripts)
    │
    ├─ on-question.ps1   (PreToolUse, matcher: AskUserQuestion)
    ├─ on-permission.ps1  (PermissionRequest)
    └─ on-stop.ps1        (Stop, with 2s dedup guard)
    │
    ▼
Signal file: ~/.claude/hooks/claude-pings-signal
    Format: "<event> <timestamp_ms>"
    Events: question | permission | done
    │
    ▼
VS Code Extension (TypeScript)
    ├─ Watches signal file for changes
    ├─ Reads event type + deduplicates
    ├─ Plays configured Windows .wav sound
    └─ Status bar: mute/unmute toggle
```

### Double-play prevention

The Stop hook reads the signal file before writing. If the last signal was written less than 2 seconds ago (meaning PreToolUse or PermissionRequest already handled this turn), it exits without writing.

### Hook scripts are minimal (~15 lines each)

They only: read stdin JSON, check mute flag, write signal file, exit. No sound playing, no notifications.

## Events

| Event               | Hook Type           | Signal   | Default Sound                    |
| ------------------- | ------------------- | -------- | -------------------------------- |
| Asks a question     | PreToolUse          | question | Windows Notify Email.wav         |
| Needs permission    | PermissionRequest   | permission | Windows Notify System Generic.wav |
| Task completed      | Stop                | done     | tada.wav                         |

## Curated Sound List (Windows MVP)

| Display Name      | File Path                                  |
| ----------------- | ------------------------------------------ |
| Tada              | C:\Windows\Media\tada.wav                  |
| Chimes            | C:\Windows\Media\chimes.wav                |
| Chord             | C:\Windows\Media\chord.wav                 |
| Ding              | C:\Windows\Media\ding.wav                  |
| Notify            | C:\Windows\Media\notify.wav                |
| Notify Email      | C:\Windows\Media\Windows Notify Email.wav  |
| Notify Calendar   | C:\Windows\Media\Windows Notify Calendar.wav |
| Notify System     | C:\Windows\Media\Windows Notify System Generic.wav |
| Exclamation       | C:\Windows\Media\Windows Exclamation.wav   |
| Ringin            | C:\Windows\Media\Windows Ringin.wav        |

## Settings Schema

Each event has two settings:
- `claudeCodePings.<event>.sound` — dropdown from curated list
- `claudeCodePings.<event>.enabled` — boolean on/off

Plus a global mute toggle via status bar icon.

## File Structure

```
claude-code-pings/
├── package.json
├── tsconfig.json
├── src/
│   └── extension.ts
├── hooks/
│   ├── on-question.ps1
│   ├── on-permission.ps1
│   └── on-stop.ps1
├── .vscodeignore
├── ROADMAP.md
└── README.md
```

## Lifecycle

- **activate():** Copy hooks to `~/.claude/hooks/`, register in `~/.claude/settings.json`, start signal file watcher, show status bar
- **deactivate():** Remove hooks from filesystem and settings.json, clean up watcher
- **Uninstall:** Same cleanup as deactivate
