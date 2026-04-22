// Audio worklet that emits a tick message every ~50ms of audio.
// Runs in the audio rendering thread — not throttled when tab is hidden,
// so it drives data collection for the stream-health monitor reliably.
class StreamMetricsTimerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.counter = 0;
    this.samplesPerTick = Math.max(1, Math.round(sampleRate * 0.05));
  }

  process() {
    this.counter += 128;
    while (this.counter >= this.samplesPerTick) {
      this.counter -= this.samplesPerTick;
      this.port.postMessage(0);
    }
    return true;
  }
}

registerProcessor('stream-metrics-timer', StreamMetricsTimerProcessor);
