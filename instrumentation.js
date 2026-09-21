export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { attachLiveTranscriptionUpgrade } = await import(
      "./features/scribe/services/live-transcription-ws-server.js"
    );
    attachLiveTranscriptionUpgrade();
  }
}
