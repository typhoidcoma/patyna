# Patyna

Real-time AI avatar with voice interaction. A mint-teal butterfly-core entity that listens, thinks, and speaks with audio-reactive animations.

## What it does

- **3D Avatar** — Pear-shaped body, butterfly wings, antennae with glowing tips, dark-pool eyes with sparkle highlights
- **Voice conversation** — Speak to Patyna via microphone (VAD + Web Speech STT), get voice responses via ElevenLabs TTS
- **Audio-reactive animation** — Mouth, wings, core glow, and antenna tips all react to the actual audio waveform per-frame using Web Audio AnalyserNode
- **Face tracking** — Camera-based head tracking via MediaPipe, avatar follows your gaze
- **Mood system** — Backend sends emotional state; environment sparkles change color to match mood
- **Presence detection** — Camera-based user presence tracking (present/away/gone) with avatar dimming and eye-close
- **Aelora memory API** — REST client for user profiles, sessions, memory facts, notes, and mood
- **TTS toggle** — Mute ElevenLabs voice to save credits; text responses still display
- **Text input** — Type messages as an alternative to voice

## Architecture

```
src/
  app.ts                    # Main orchestrator — wires everything together
  main.ts                   # Entry point — mounts App into #app

  core/
    state-machine.ts        # idle -> listening -> thinking -> speaking
    event-bus.ts            # Typed pub/sub for decoupled communication

  scene/
    scene-manager.ts        # Three.js renderer, camera, lights, resize
    avatar.ts               # 3D butterfly avatar — geometry, materials, animation
    avatar-controller.ts    # Face-tracking gaze controller
    environment.ts          # Shader-based background with mood-colored sparkles

  audio/
    audio-manager.ts        # AudioContext lifecycle
    tts-player.ts           # AudioWorklet playback + AnalyserNode for amplitude
    elevenlabs-tts.ts       # ElevenLabs WebSocket streaming TTS

  voice/
    voice-manager.ts        # Coordinates VAD + STT
    vad.ts                  # Voice Activity Detection (@ricky0123/vad-web)
    stt-provider.ts         # STT interface
    web-speech-stt.ts       # Web Speech API implementation

  comm/
    protocol.ts             # Aelora backend protocol (WebSocket + presence)
    websocket-client.ts     # Reconnecting WebSocket wrapper
    message-codec.ts        # JSON message encoding/decoding

  api/
    aelora-client.ts        # Aelora REST API client (users, sessions, memory, notes, mood)

  tracking/
    webcam.ts               # Camera stream management
    face-tracker.ts         # MediaPipe face landmark detection
    presence-manager.ts     # User presence detection (present/away/gone)

  ui/
    hud.ts                  # HUD overlay + input panel + media toggles
    hud.css                 # HUD styles

  types/
    config.ts               # App configuration + defaults
    events.ts               # EventBus type map
    messages.ts             # WebSocket protocol message types
```

## State machine

```
idle --> listening --> thinking --> speaking --> idle
                                      |
                         (idle --> speaking)  // handles audio race condition
```

- **idle** — Calm floating, gentle bob and wing shimmer
- **listening** — Forward lean, wings angled in, mouth slightly open
- **thinking** — Stays visually calm (same as idle) while waiting for audio
- **speaking** — Audio-reactive: mouth tracks amplitude, wings flutter with voice intensity, antenna tips glow brighter with louder audio, core pulses

## Presence states

```
present --> away (15s no face) --> gone (2min no face)
    ^_________________________________|  (face detected)
```

- **present** — Full animation and glow
- **away** — Dimmed to 40%, subtle idle only
- **gone** — Dimmed to 10%, eyes closed

Camera toggle off pauses detection (doesn't trigger away/gone).

## Audio pipeline

```
ElevenLabs WS --> base64 decode --> PCM16->Float32 --> AudioWorklet --> AnalyserNode --> speakers
                                                                            |
                                                              getAmplitude() per frame
                                                                            |
                                                              avatar mouth, wings, glow
```

The AnalyserNode (smoothingTimeConstant=0.75) provides per-frame waveform data synced with audio output. Amplitude smoothing uses frame-rate independent exponential lerp with asymmetric attack/release.

## Tech stack

- **Three.js** — 3D rendering (MeshPhysicalMaterial, ShaderMaterial, ExtrudeGeometry)
- **Web Audio API** — AudioWorklet for low-latency TTS playback, AnalyserNode for amplitude
- **MediaPipe** — Face landmark detection for gaze tracking
- **VAD** — @ricky0123/vad-web for voice activity detection
- **Web Speech API** — Browser-native speech-to-text
- **ElevenLabs** — Streaming text-to-speech via WebSocket
- **Aelora** — AI backend (WebSocket chat + REST API for memory/users/sessions)
- **Vite** — Dev server and bundler
- **TypeScript** — Full type safety throughout

## Setup

```bash
npm install
```

Create `.env`:

```
VITE_ELEVENLABS_API_KEY=your-elevenlabs-api-key
VITE_ELEVENLABS_VOICE_ID=your-voice-id

# Aelora backend identity
VITE_AELORA_API_KEY=your-api-key
VITE_USER_ID=your-user-id
VITE_USERNAME=YourName
VITE_SESSION_ID=patyna-web
```

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run preview  # Preview production build (port 4173)
```

Open in browser, click "Click to begin", grant mic + camera permissions.

## HUD controls

- **🎤** — Toggle microphone (VAD + STT)
- **📷** — Toggle camera (face tracking + presence)
- **🔊** — Toggle ElevenLabs TTS (mute saves credits, text responses still show)
