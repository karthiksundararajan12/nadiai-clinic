/**
 * @fileoverview Public API barrel for the recording sub-feature.
 */

export { RecordingService }     from "./service.js";
export { useRecording }         from "./use-recording.js";
export { useAudioLevel }        from "./use-audio-level.js";
export { useDeviceSelection }   from "./use-device-selection.js";
export { useRecordingTimer, formatDuration } from "./use-recording-timer.js";
export { RECORDING_STATE, RECORDING_LIMITS, MIME_TYPE_PRIORITY } from "./constants.js";
export {
  RecordingError,
  BrowserNotSupportedError,
  PermissionDeniedError,
  PermissionDismissedError,
  DeviceNotFoundError,
  DeviceInUseError,
  RecordingInterruptedError,
  PauseNotSupportedError,
  wrapMediaError,
  isRecordingError,
} from "./errors.js";
