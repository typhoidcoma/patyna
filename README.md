# PATYNA

Real-time AI avatar with voice interaction. Mint-teal butterfly-core entity that listens, thinks, and speaks.

<details>
<summary>Features</summary>

- 3D avatar: pear body, butterfly wings, glowing antenna tips, sparkle eyes
- Voice conversation via VAD + Web Speech STT + ElevenLabs TTS
- Audio-reactive animation via Web Audio AnalyserNode
- Face tracking via MediaPipe
- Mood-driven animation profiles with smooth state blending
- Presence detection (present/away/gone) with avatar dimming
- Aelora memory API integration
- TTS toggle to mute ElevenLabs and save credits
- Text input fallback
- P0 demo: interactive task dashboard with LLM coaching, celebrations, and draggable widgets

</details>

<details>
<summary>Architecture</summary>

```
src/
  app.ts                    # Main orchestrator
  main.ts                   # Entry point

  core/
    state-machine.ts        # idle > listening > thinking > speaking
    event-bus.ts            # Typed pub/sub

  utils/
    lerp.ts                 # Interpolation helpers
    ring-buffer.ts          # Ring buffer data structure

  scene/
    scene-manager.ts        # Three.js renderer, camera, lights
    avatar.ts               # 3D butterfly avatar
    avatar-controller.ts    # Face-tracking gaze controller
    environment.ts          # Shader background + mood sparkles
    mood-animations.ts      # Mood-driven animation profiles
    mood-colors.ts          # Emotion-to-color mapping

  audio/
    audio-manager.ts        # AudioContext lifecycle
    tts-player.ts           # AudioWorklet + AnalyserNode
    elevenlabs-tts.ts       # ElevenLabs WebSocket streaming TTS

  voice/
    voice-manager.ts        # Coordinates VAD + STT
    vad.ts                  # @ricky0123/vad-web
    stt-provider.ts         # STT interface
    web-speech-stt.ts       # Web Speech API

  comm/
    protocol.ts             # Aelora WebSocket protocol + presence
    websocket-client.ts     # Reconnecting WebSocket
    message-codec.ts        # JSON message codec

  api/
    aelora-client.ts        # REST client (users, sessions, memory, notes, mood)

  tracking/
    webcam.ts               # Camera stream
    face-tracker.ts         # MediaPipe face landmarks
    presence-manager.ts     # Presence detection

  ui/
    hud.ts                  # Overlay + input panel + toggles
    hud.css                 # Styles
    sidebar.ts              # Sidebar widget container
    demo-hud.ts             # Demo HUD (login, text input, reset)
    demo-sidebar.ts         # Goals & tasks floating widgets
    today-card.ts           # Schedule card widget
    speech-bubble.ts        # Floating LLM response bubble
    draggable.ts            # Drag utility for floating widgets

  fx/
    celebration.ts          # Task completion effects (stars, flash, sparkle, chime)

  demo/
    demo-main.ts            # Demo entry point
    demo-app.ts             # P0 demo orchestrator
    demo-state.ts           # Demo goals/tasks/schedule state
    demo-data.ts            # Seed data (goals, tasks, schedule)
    demo-types.ts           # Demo data types
    demo-overrides.css      # Demo-specific styles

  types/
    config.ts               # Config + defaults
    events.ts               # EventBus type map
    messages.ts             # WebSocket message types
```

</details>

<details>
<summary>State machine</summary>

```
idle --> listening --> thinking --> speaking --> idle
                                      |
                         (idle --> speaking)  // audio race condition
```

- **idle** : gentle bob, wing shimmer
- **listening** : forward lean, wings angled in
- **thinking** : visually calm, same as idle
- **speaking** : audio-reactive mouth, wings, core glow, antenna tips

</details>

<details>
<summary>Presence</summary>

```
present --> away (15s no face) --> gone (2min no face)
    ^_________________________________|  (face detected)
```

- **present** : full animation
- **away** : dimmed to 40%
- **gone** : dimmed to 10%, eyes closed

Camera off pauses detection without triggering away/gone.

</details>

<details>
<summary>Audio pipeline</summary>

```
ElevenLabs WS > binary Float32 PCM > AudioWorklet ring buffer > AnalyserNode > speakers
                                              |
                                    getAmplitude() per frame
                                              |
                                    avatar mouth, wings, glow
```

60s ring buffer with 1.5s drain grace period for chunk gaps. AnalyserNode smoothingTimeConstant=0.75. Frame-rate independent exponential lerp with asymmetric attack/release.

</details>

<details>
<summary>Tech stack</summary>

- Three.js
- Web Audio API (AudioWorklet + AnalyserNode)
- MediaPipe
- @ricky0123/vad-web
- Web Speech API
- ElevenLabs streaming TTS
- Aelora (WebSocket chat + REST memory API)
- Vite + TypeScript

</details>

<details>
<summary>Setup</summary>

```bash
npm install
```

Create `.env`:

```
VITE_ELEVENLABS_API_KEY=your-key
VITE_ELEVENLABS_VOICE_ID=your-voice-id

VITE_AELORA_API_KEY=your-key
VITE_USER_ID=your-user-id
VITE_USERNAME=YourName
VITE_SESSION_ID=patyna-web
```

```bash
npm run dev      # port 3005
npm run build    # production
npm run preview  # port 4173
```

**Main app:** Click "Click to begin", grant mic + camera.

**Demo:** Open `localhost:3005/demo.html`, enter a username, text-only (no mic/camera needed).

</details>

<details>
<summary>P0 Demo</summary>

Interactive task dashboard with LLM-powered coaching.

- Entry: `demo.html` loads `src/demo/demo-app.ts`
- Login overlay with username (persisted in localStorage)
- Dashboard widgets: today card (schedule), goals (progress bars), tasks (checkboxes + points)
- LLM responds to task completions and free-text chat via Aelora WebSocket
- Celebration effects on task complete: star particle burst, gold widget flash, points bar shimmer, sparkle chime, avatar joy spin, mini sparkle at checkbox
- Widgets are draggable by their headers, auto-stack on resize
- Each widget has a unique color tint: lavender (schedule), gold (goals), mint (tasks)
- Response text auto-fades after 8 seconds
- Reset button clears all tasks and conversation history

</details>

<details>
<summary>HUD controls</summary>

**Main app:**
- 🎤 toggle mic (VAD + STT)
- 📷 toggle camera (face tracking + presence)
- 🔊 toggle TTS (mute saves ElevenLabs credits)

**Demo:** Text input replaces mic/camera. TTS toggle + Reset button in nav bar.

</details>
