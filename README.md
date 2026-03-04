# Claude Code Pings

**Plays distinct notification sounds when Claude Code finishes a task, asks a question, or needs permission.**

Never miss a prompt from Claude Code again — hear it even when VS Code is in the background.

## Install

Download `claude-code-pings-1.0.0.vsix` and run:

code --install-extension claude-code-pings-1.0.0.vsix

## Features

| Event | Default Sound | Description |
|-------|--------------|-------------|
| Task Completed | Tada | Claude finished working |
| Asks Question | Chord | Claude needs your input |
| Needs Permission | Notify System | Claude wants to use a tool |

- **10 built-in Windows sounds** to choose from per event
- **Status bar toggle** — click `Pings` to mute/unmute instantly
- **Multi-window safe** — only one sound plays even with multiple VS Code windows open

## How It Works

The extension registers [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) that write a signal to a shared file when Claude Code triggers an event. A lightweight file watcher in VS Code picks up the signal and plays the configured sound via the Windows `PlaySound` API.

```
Claude Code hook → writes signal file → VS Code fs.watch → plays sound
```

## Configuration

Open **Settings** (`Ctrl+,`) and search for `Claude Code Pings`:

| Setting | Type | Default |
|---------|------|---------|
| `claudeCodePings.taskCompleted.enabled` | boolean | `true` |
| `claudeCodePings.taskCompleted.sound` | enum | `Tada` |
| `claudeCodePings.asksQuestion.enabled` | boolean | `true` |
| `claudeCodePings.asksQuestion.sound` | enum | `Chord` |
| `claudeCodePings.needsPermission.enabled` | boolean | `true` |
| `claudeCodePings.needsPermission.sound` | enum | `Notify System` |

Available sounds: Tada, Chimes, Chord, Ding, Notify, Notify Email, Notify Calendar, Notify System, Exclamation, Ringin.

## Requirements

- **Windows** (uses `winmm.dll PlaySound` and PowerShell hooks)
- **Claude Code CLI** installed and configured
- **VS Code 1.85+**

## Commands

| Command | Description |
|---------|-------------|
| `Claude Code Pings: Toggle Sound` | Mute/unmute all notification sounds |

Also available via the status bar icon (bell).

## License

[MIT](LICENSE)
