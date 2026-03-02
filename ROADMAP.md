# Claude Code Pings - Roadmap

## v1.0 - MVP (Current)

- [x] 3 notification events: Task Completed, Asks Question, Needs Permission
- [x] 10 curated Windows sounds
- [x] Per-event sound selection and enable/disable toggle
- [x] Status bar mute/unmute toggle
- [x] No double-play bug (dedup guard in Stop hook)
- [x] Windows only

## v1.1 - More Sounds

- [ ] Allow custom .wav file path as sound source
- [ ] Expand curated list to ~20 sounds
- [ ] Sound preview button in settings (play before selecting)

## v1.2 - Taskbar Blink

- [ ] VS Code window blinks in the Windows taskbar when a notification fires
- [ ] Configurable: blink on all events, or only specific ones
- [ ] Auto-stop blinking when VS Code window regains focus

## v1.3 - macOS Support

- [ ] Detect platform and show appropriate sound list
- [ ] macOS: use `afplay` for sound playback
- [ ] macOS: use `osascript` for native notifications
- [ ] Hook scripts: `.sh` or `.js` variants for macOS/Linux

## v2.0 - Extended Events

- [ ] Subagent finished (SubagentStop hook)
- [ ] Tool failure alert (PostToolUseFailure hook)
- [ ] Session start/resume chime (SessionStart hook)
- [ ] Configurable notification popup text

## Future Ideas

- [ ] Linux support (paplay/aplay for sound playback)
- [ ] WSL support
- [ ] Volume control per event
- [ ] Notification history panel in VS Code sidebar
- [ ] "Do not disturb" schedule (mute during certain hours)
- [ ] Sound themes (presets for all 3 events)
