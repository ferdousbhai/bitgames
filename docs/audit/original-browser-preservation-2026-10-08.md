# Original browser preservation — 2026-10-08

Full-access browser checks now run successfully, superseding the earlier sandbox launch failures. All **12 originals passed Chromium**. **11 passed WebKit**. Both engines used touch-enabled portrait (834×1194) and landscape (1194×834) viewports and checked loading, menu, start tap, active-play layout, touch targets, overflow, control hit testing, page errors and failed HTTP responses.

WebKit Crash Racers completed loading, menu and active-play layout checks in both orientations, but failed the final clean-page-error assertion with `InvalidStateError: Failed to start the audio device`. An isolated retry reproduced this error. The machine has a running PulseAudio/PipeWire server; this run does not establish whether the failure is specific to the headless browser or game audio initialization. No audio-output pass is claimed. Chromium Crash Racers passed.

No original game or test harness was modified. These automated preservation checks do not measure child enjoyment, extended gameplay or physical iPad behavior. Detailed measurements are in [the JSON evidence](original-browser-preservation-2026-10-08.json). Screenshots and raw reports remain under `/tmp/bitgames-playtest/{chromium,webkit}-originals-retirement*`.
