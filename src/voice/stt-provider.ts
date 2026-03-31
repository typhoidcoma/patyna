/**
 * STT provider interface — abstracts speech-to-text backends.
 * Swap Web Speech API for backend Whisper without touching consumers.
 */

export interface STTResult {
  text: string;
  isFinal: boolean;
}

export type STTCallback = (result: STTResult) => void;

export interface STTProvider {
  /** Human-readable name for logging. */
  readonly name: string;

  /** Whether the provider is currently listening. */
  readonly listening: boolean;

  /** Start recognition. Results delivered via callback. */
  start(onResult: STTCallback): void;

  /** Stop recognition. Optional callback runs once the session has fully ended. */
  stop(onStopped?: () => void): void;
}
