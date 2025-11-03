/**
 * Browser-based audio streaming to Icecast/Liquidsoap
 * Uses native MediaRecorder API with Opus encoding
 */

export type AudioSource = 'microphone' | 'desktop';

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'disconnected';

export interface StreamMetadata {
  // Editable fields (user can set)
  title?: string;          // ice-name: Track/episode title
  artist?: string;         // ice-artist: Artist name
  description?: string;    // ice-description: Stream description
  genre?: string;          // ice-genre: Music/Talk/etc
  url?: string;            // ice-url: Station website

  // Read-only from JWT (displayed but not editable)
  showName?: string;       // From JWT payload
  username?: string;       // From JWT payload
}

export interface StreamStats {
  duration: number;
  bytesSent: number;
  audioLevel: number;
}

export interface StreamingOptions {
  endpoint: string;
  token: string;
  source: AudioSource;
  metadata?: StreamMetadata;
  bitrate?: number;
  onStatusChange?: (status: StreamStatus) => void;
  onError?: (error: Error) => void;
  onStats?: (stats: StreamStats) => void;
}

/**
 * Client for streaming audio via WebSocket using Webcast protocol
 */
export class WebcastStreamClient {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private webSocket: WebSocket | null = null;

  private status: StreamStatus = 'idle';
  private startTime: number = 0;
  private bytesSent: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private selectedMimeType: string = '';

  private options: StreamingOptions | null = null;

  /**
   * Start streaming audio via WebSocket
   */
  async startStreaming(options: StreamingOptions): Promise<void> {
    if (this.status === 'streaming' || this.status === 'connecting') {
      throw new Error('Already streaming or connecting');
    }

    this.options = options;
    this.reconnectAttempts = 0;

    await this.connect();
  }

  /**
   * Internal connection logic
   */
  private async connect(): Promise<void> {
    if (!this.options) {
      throw new Error('No options provided');
    }

    try {
      this.setStatus('connecting');

      // Capture audio from selected source
      await this.captureAudio(this.options.source);

      // Setup MediaRecorder with Opus encoding
      this.setupMediaRecorder(this.options.bitrate || 128000);

      // Setup audio analysis for level metering
      this.setupAudioAnalysis();

      // Connect WebSocket and authenticate
      await this.connectWebSocket(this.options.endpoint, this.options.token, this.options.metadata);

      this.startTime = Date.now();
      this.bytesSent = 0;
      this.setStatus('streaming');

      // Start stats reporting
      this.startStatsReporting();

    } catch (error) {
      this.setStatus('error');
      this.cleanup();
      throw error;
    }
  }

  /**
   * Capture audio from microphone or desktop
   */
  private async captureAudio(source: AudioSource): Promise<void> {
    try {
      if (source === 'microphone') {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
          },
          video: false,
        });
      } else {
        // Desktop audio capture
        // Note: getDisplayMedia requires video to be true, even if we only want audio
        // We'll request both and then stop the video track
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: {
            width: 1280,
            height: 720,
          },
        });

        // Stop all video tracks since we only need audio
        const videoTracks = displayStream.getVideoTracks();
        videoTracks.forEach(track => track.stop());

        // Check if we got audio tracks
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('No audio track in screen capture. Make sure to check "Share audio" in the browser dialog.');
        }

        console.log('[Webcast] Desktop audio tracks:', audioTracks.length);
        this.mediaStream = displayStream;
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Permission denied. Please allow screen/audio capture.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No audio source found.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Desktop audio capture not supported in this browser. Try Chrome.');
      } else {
        throw new Error(`Failed to capture audio: ${error.message}`);
      }
    }
  }

  /**
   * Setup MediaRecorder with Opus encoding
   */
  private setupMediaRecorder(bitrate: number): void {
    if (!this.mediaStream) {
      throw new Error('No media stream available');
    }

    // Try different Opus codec formats (browser compatibility)
    const mimeTypes = [
      'audio/webm; codecs=opus',  // Chrome, Edge, Firefox
      'audio/ogg; codecs=opus',   // Firefox, some browsers
      'audio/webm',               // Fallback (usually VP8/Opus)
    ];

    let selectedMimeType: string | null = null;
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }

    if (!selectedMimeType) {
      throw new Error('No supported audio codec found. Please use Chrome, Firefox, or Edge.');
    }

    this.selectedMimeType = selectedMimeType;
    console.log('[Webcast] Using codec:', selectedMimeType);

    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: selectedMimeType,
      audioBitsPerSecond: bitrate,
    });
  }

  /**
   * Setup Web Audio API for audio level analysis
   */
  private setupAudioAnalysis(): void {
    if (!this.mediaStream) return;

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      source.connect(this.analyserNode);
    } catch (error) {
      console.warn('[Webcast] Failed to setup audio analysis:', error);
    }
  }

  /**
   * Connect WebSocket and authenticate using Webcast protocol
   */
  private async connectWebSocket(
    endpoint: string,
    token: string,
    metadata?: StreamMetadata
  ): Promise<void> {
    if (!this.mediaRecorder) {
      throw new Error('MediaRecorder not initialized');
    }

    // Convert HTTP endpoint to WebSocket URL
    const wsUrl = endpoint.replace(/^http/, 'ws');

    console.log('[Webcast] Connecting to:', wsUrl);
    console.log('[Webcast] Selected codec:', this.selectedMimeType);
    console.log('[Webcast] Metadata:', metadata);

    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket with "webcast" subprotocol
        this.webSocket = new WebSocket(wsUrl, 'webcast');
        this.webSocket.binaryType = 'arraybuffer';

        this.webSocket.onopen = () => {
          console.log('[Webcast] WebSocket connected');

          // Send HELLO message for authentication
          this.sendHelloMessage(token, metadata);

          // Start MediaRecorder after HELLO sent
          this.startMediaRecorder();

          resolve();
        };

        this.webSocket.onerror = (event) => {
          console.error('[Webcast] WebSocket error:', event);
          const error = new Error('WebSocket connection failed');
          this.handleError(error);
          reject(error);
        };

        this.webSocket.onclose = (event) => {
          console.log('[Webcast] WebSocket closed:', event.code, event.reason);
          if (this.status === 'streaming') {
            this.setStatus('disconnected');
          }
        };

        this.webSocket.onmessage = (event) => {
          console.log('[Webcast] Server message:', event.data);
        };

      } catch (error: any) {
        console.error('[Webcast] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Send HELLO message with authentication and codec info
   */
  private sendHelloMessage(token: string, metadata?: StreamMetadata): void {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      console.error('[Webcast] Cannot send HELLO: WebSocket not ready');
      return;
    }

    // Format name as "Artist - Title" for Icecast compatibility
    let name = '';
    if (metadata?.artist && metadata?.title) {
      name = `${metadata.artist} - ${metadata.title}`;
    } else if (metadata?.title) {
      name = metadata.title;
    } else if (metadata?.artist) {
      name = metadata.artist;
    }

    const hello = {
      type: 'hello',
      data: {
        mime: this.selectedMimeType,
        user: 'source',
        password: token,
        channels: 2,
        samplerate: 48000,
        bitrate: this.options?.bitrate || 128000,
        // Metadata in dual format (Icecast + Liquidsoap)
        info: {
          // Combined name for Icecast compatibility
          name: name,
          // Separate fields for Liquidsoap on_metadata callback
          title: metadata?.title || '',
          artist: metadata?.artist || '',
          description: metadata?.description || '',
          genre: metadata?.genre || '',
          url: metadata?.url || '',
        }
      }
    };

    console.log('[Webcast] Sending HELLO:', hello);
    this.webSocket.send(JSON.stringify(hello));
  }

  /**
   * Start MediaRecorder and send audio chunks via WebSocket
   */
  private startMediaRecorder(): void {
    if (!this.mediaRecorder || !this.webSocket) {
      throw new Error('MediaRecorder or WebSocket not initialized');
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
        console.log('[Webcast] Sending audio chunk:', event.data.size, 'bytes');
        this.bytesSent += event.data.size;

        // Send audio chunk as binary WebSocket frame
        this.webSocket.send(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log('[Webcast] MediaRecorder stopped');
    };

    this.mediaRecorder.onerror = (event: any) => {
      const error = new Error(`MediaRecorder error: ${event.error?.message || 'Unknown'}`);
      console.error('[Webcast] MediaRecorder error:', error);
      this.handleError(error);
    };

    // Start recording with 1 second chunks
    console.log('[Webcast] Starting MediaRecorder...');
    this.mediaRecorder.start(1000);

    // Send initial metadata after starting streaming
    // This ensures the backend receives the metadata as a separate message
    if (this.options?.metadata) {
      // Small delay to ensure streaming is fully established
      setTimeout(() => {
        if (this.options?.metadata) {
          this.updateMetadata(this.options.metadata);
        }
      }, 500);
    }
  }

  /**
   * Update metadata dynamically during streaming
   */
  updateMetadata(metadata: StreamMetadata): void {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      console.warn('[Webcast] Cannot update metadata: WebSocket not ready');
      return;
    }

    // Format name as "Artist - Title" for Icecast compatibility
    let name = '';
    if (metadata.artist && metadata.title) {
      name = `${metadata.artist} - ${metadata.title}`;
    } else if (metadata.title) {
      name = metadata.title;
    } else if (metadata.artist) {
      name = metadata.artist;
    }

    const metadataMessage = {
      type: 'metadata',
      data: {
        // Combined name for Icecast compatibility
        name: name,
        // Separate fields for Liquidsoap on_metadata callback
        title: metadata.title || '',
        artist: metadata.artist || '',
        description: metadata.description || '',
        genre: metadata.genre || '',
        url: metadata.url || '',
      }
    };

    console.log('[Webcast] Sending METADATA:', metadataMessage);
    this.webSocket.send(JSON.stringify(metadataMessage));
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.setStatus('idle');
    this.cleanup();
  }

  /**
   * Attempt to reconnect after disconnection
   */
  async reconnect(): Promise<void> {
    if (!this.options) {
      throw new Error('No streaming options available');
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error('Max reconnection attempts reached');
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    console.log(`[Webcast] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();
  }

  /**
   * Get current audio level (0-1)
   */
  private getAudioLevel(): number {
    if (!this.analyserNode) return 0;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    return Math.min((average / 255) * 1.5, 1.0);
  }

  /**
   * Start periodic stats reporting
   */
  private startStatsReporting(): void {
    const interval = setInterval(() => {
      if (this.status !== 'streaming') {
        clearInterval(interval);
        return;
      }

      const duration = Math.floor((Date.now() - this.startTime) / 1000);
      const audioLevel = this.getAudioLevel();

      this.options?.onStats?.(({
        duration,
        bytesSent: this.bytesSent,
        audioLevel,
      }));
    }, 100);
  }

  /**
   * Stop media recorder
   */
  private stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Close WebSocket
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }

    // Stop recording
    this.stopRecording();
    this.mediaRecorder = null;

    // Release media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyserNode = null;
  }

  /**
   * Update status and notify
   */
  private setStatus(status: StreamStatus): void {
    this.status = status;
    this.options?.onStatusChange?.(status);
  }

  /**
   * Handle error and notify
   */
  private handleError(error: Error): void {
    this.setStatus('error');
    this.options?.onError?.(error);
    this.cleanup();
  }

  /**
   * Get current status
   */
  getStatus(): StreamStatus {
    return this.status;
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.status === 'streaming';
  }
}
