/**
 * @fileoverview Public API barrel for recording UI components.
 *
 * Import from here in pages and layouts:
 *   import { RecordingControls } from "@/features/scribe/components/recording";
 */

export { RecordingControls } from "./RecordingControls.jsx";
export { RecordButton }      from "./RecordButton.jsx";
export { RecordingTimer }    from "./RecordingTimer.jsx";
export { AudioLevelMeter }   from "./AudioLevelMeter.jsx";
export { DeviceSelector }    from "./DeviceSelector.jsx";
export { PermissionPrompt }  from "./PermissionPrompt.jsx";
export { formatBytes }       from "./utils.js";
