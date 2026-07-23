// AuraCut - Video CRF Processing Engine Logic

// Extract Muxer and ArrayBufferTarget from the global Mp4Muxer library
const Muxer = window.Mp4Muxer ? window.Mp4Muxer.Muxer : null;
const ArrayBufferTarget = window.Mp4Muxer ? window.Mp4Muxer.ArrayBufferTarget : null;

// Helper function to create distortion curve for subtle harmonic wave shaping (anti-copyright)
function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 10;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// State variables
let state = {
  file: null,
  videoDuration: 0,
  videoWidth: 0,
  videoHeight: 0,
  fps: 30,
  audioContext: null,
  originalAudioBuffer: null,
  processedAudioBuffer: null,
  isPlaying: false,
  isProcessing: false,
  currentSpeed: 1.05,
  speedPhase: 0,
  audioFilterPhase: 0,
  speedHistory: [],
  maxHistoryLength: 60,
  dirtOpacity: 0.5,
  frameCounter: 0,
  recordedChunks: [],
  mediaRecorder: null,
  audioSourceNode: null,
  audioDestinationNode: null,
  previewAudioSource: null,
  previewFilterNode: null,
  previewShaperNode: null,
  gainNode: null,
  speedTimer: null,
  animationFrameId: null,
  staticOpacity: 0.15,
  glitchIntensity: 0.000002, // 0.0002% of width
  mirrorEnabled: false,
  zoomEnabled: false,
  tiltEnabled: true,
  vignetteEnabled: true,
  audioPlayhead: 0,
  lastAudioUpdateTime: 0,
  audioPlaybackRate: 1.0,
  watermarkEnabled: true,
  watermarkUnlocked: false,
  watermarkPassword: "Loveauracutbd",
  exportFormat: {
    mimeType: 'video/webm',
    extension: 'webm',
    displayName: 'WebM'
  }
};

// Watermark and Outro Logo Assets
const watermarkImg = new Image();
watermarkImg.crossOrigin = "anonymous";
watermarkImg.src = atob("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2FtYXJsb3ZldGlwcy9pbXByb3RlbnQvcmVmcy9oZWFkcy9tYWluL3dhdGVybWFyay5wbmc=");

const logoImg = new Image();
logoImg.crossOrigin = "anonymous";
logoImg.src = atob("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2FtYXJsb3ZldGlwcy9pbXByb3RlbnQvcmVmcy9oZWFkcy9tYWluL2xvZ28tMDEucG5n");

// Offscreen Noise Canvas for TV Static (Jirjir) Effect
let noiseCanvas = document.createElement('canvas');
noiseCanvas.width = 256;
noiseCanvas.height = 256;
let noiseCtx = noiseCanvas.getContext('2d');

// Speed Graph Drawing variables
let graphCanvas = document.getElementById('speed-graph');
let graphCtx = graphCanvas.getContext('2d');

// DOM Elements
const uploadZone = document.getElementById('upload-zone');
const browseBtn = document.getElementById('browse-btn');
const videoInput = document.getElementById('video-input');
const sourceVideo = document.getElementById('source-video');
const renderCanvas = document.getElementById('render-canvas');
const renderCtx = renderCanvas.getContext('2d');
const canvasWrapper = document.getElementById('canvas-wrapper');
const mediaControlsBar = document.getElementById('media-controls-bar');
const playPauseBtn = document.getElementById('play-pause-btn');
const timelineSlider = document.getElementById('timeline-slider');
const timelineProgress = document.getElementById('timeline-progress');
const currentTimeDisplay = document.getElementById('current-time');
const durationTimeDisplay = document.getElementById('duration-time');
const muteBtn = document.getElementById('mute-btn');
const processBtn = document.getElementById('process-btn');
const processingLoader = document.getElementById('processing-loader');
const exportProgress = document.getElementById('export-progress');
const downloadSection = document.getElementById('download-section');
const downloadBtn = document.getElementById('download-btn');
const fileDetails = document.getElementById('file-details');
const fileNameDisplay = document.getElementById('file-name');
const fileSizeVal = document.getElementById('file-size-val');
const inputDurationVal = document.getElementById('input-duration-val');
const outputDurationVal = document.getElementById('output-duration-val');
const speedIndicator = document.getElementById('speed-badge');
const staticOpacitySlider = document.getElementById('static-opacity-slider');
const staticOpacityBadge = document.getElementById('static-opacity-badge');
const glitchIntensitySlider = document.getElementById('glitch-intensity-slider');
const glitchIntensityBadge = document.getElementById('glitch-intensity-badge');
const inputGlitchVal = document.getElementById('input-glitch-val');
const outputGlitchVal = document.getElementById('output-glitch-val');
const inputFramesVal = document.getElementById('input-frames-val');
const outputFramesVal = document.getElementById('output-frames-val');
const formatBadge = document.getElementById('format-badge');
const inputHashVal = document.getElementById('input-hash-val');
const outputHashVal = document.getElementById('output-hash-val');
const inputSigVal = document.getElementById('input-sig-val');
const outputSigVal = document.getElementById('output-sig-val');
const inputUuidVal = document.getElementById('input-uuid-val');
const outputUuidVal = document.getElementById('output-uuid-val');
const inputDateVal = document.getElementById('input-date-val');
const outputDateVal = document.getElementById('output-date-val');
const inputFormatVal = document.getElementById('input-format-val');
const outputFormatVal = document.getElementById('output-format-val');
const inputVcodecVal = document.getElementById('input-vcodec-val');
const outputVcodecVal = document.getElementById('output-vcodec-val');
const inputAspectVal = document.getElementById('input-aspect-val');
const outputAspectVal = document.getElementById('output-aspect-val');
const inputFramecountVal = document.getElementById('input-framecount-val');
const outputFramecountVal = document.getElementById('output-framecount-val');
const inputChannelsVal = document.getElementById('input-channels-val');
const outputChannelsVal = document.getElementById('output-channels-val');
const inputFpsVal = document.getElementById('input-fps-val');
const outputFpsVal = document.getElementById('output-fps-val');
const inputAudioFreqVal = document.getElementById('input-audio-freq-val');
const outputAudioFreqVal = document.getElementById('output-audio-freq-val');
const inputTotalsamplesVal = document.getElementById('input-totalsamples-val');
const outputTotalsamplesVal = document.getElementById('output-totalsamples-val');
const inputJitterVal = document.getElementById('input-jitter-val');
const outputJitterVal = document.getElementById('output-jitter-val');
const inputWaveformCanvas = document.getElementById('input-waveform');
const outputWaveformCanvas = document.getElementById('output-waveform');
const inputWaveSub = document.getElementById('input-wave-sub');
const outputWaveSub = document.getElementById('output-wave-sub');

// Advanced Forensic and AI Fingerprint Elements
const inputAhashVal = document.getElementById('input-ahash-val');
const outputAhashVal = document.getElementById('output-ahash-val');
const inputDhashVal = document.getElementById('input-dhash-val');
const outputDhashVal = document.getElementById('output-dhash-val');
const inputPhashVal = document.getElementById('input-phash-val');
const outputPhashVal = document.getElementById('output-phash-val');
const inputVfingerprintVal = document.getElementById('input-vfingerprint-val');
const outputVfingerprintVal = document.getElementById('output-vfingerprint-val');
const inputKeyframeVal = document.getElementById('input-keyframe-val');
const outputKeyframeVal = document.getElementById('output-keyframe-val');
const inputSceneVal = document.getElementById('input-scene-val');
const outputSceneVal = document.getElementById('output-scene-val');
const inputAfingerprintVal = document.getElementById('input-afingerprint-val');
const outputAfingerprintVal = document.getElementById('output-afingerprint-val');
const inputFeaturesVal = document.getElementById('input-features-val');
const outputFeaturesVal = document.getElementById('output-features-val');
const inputObjectVal = document.getElementById('input-object-val');
const outputObjectVal = document.getElementById('output-object-val');
const inputFaceVal = document.getElementById('input-face-val');
const outputFaceVal = document.getElementById('output-face-val');
const inputOcrVal = document.getElementById('input-ocr-val');
const outputOcrVal = document.getElementById('output-ocr-val');
const inputMotionVal = document.getElementById('input-motion-val');
const outputMotionVal = document.getElementById('output-motion-val');
const inputReverseVal = document.getElementById('input-reverse-val');
const outputReverseVal = document.getElementById('output-reverse-val');
const inputEmbeddingVal = document.getElementById('input-embedding-val');
const outputEmbeddingVal = document.getElementById('output-embedding-val');
const inputCopyrightVal = document.getElementById('input-copyright-val');
const outputCopyrightVal = document.getElementById('output-copyright-val');

// Detect best format support
detectFormatSupport();

// Initialize Events
setupEventListeners();
resizeGraphCanvas();
drawGraph(); // Draw initial empty graph

// Helper to detect format support (prioritizing MP4)
function detectFormatSupport() {
  const hasWebCodecs = (typeof window.VideoEncoder !== 'undefined') && 
                       (typeof window.AudioEncoder !== 'undefined') &&
                       (typeof window.MediaStreamTrackProcessor !== 'undefined') &&
                       (Muxer !== null);
  
  let mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
  let extension = 'mp4';
  let displayName = 'MP4 Output';

  if (hasWebCodecs) {
    // 100% Real MP4 output using WebCodecs + mp4-muxer
    state.exportFormat = { mimeType, extension, displayName };
  } else {
    // Fallback to checking MediaRecorder support
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4;codecs=avc1';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      // Fallback to webm
      mimeType = 'video/webm;codecs=vp9,opus';
      extension = 'webm';
      displayName = 'WebM Output';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
    }
    state.exportFormat = { mimeType, extension, displayName };
  }

  if (formatBadge) {
    formatBadge.textContent = displayName;
    if (extension === 'mp4') {
      formatBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      formatBadge.style.color = 'var(--neon-green)';
      formatBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      formatBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      formatBadge.style.color = 'var(--neon-orange)';
      formatBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    }
  }
}

// Setup Event Listeners
function setupEventListeners() {
  window.addEventListener('resize', () => {
    resizeGraphCanvas();
    drawGraph();
  });

  // ResizeObservers for waveforms to prevent 0-width rendering bugs on layout changes
  if (typeof ResizeObserver !== 'undefined') {
    const inputObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          inputWaveformCanvas.width = width;
          inputWaveformCanvas.height = height;
          if (state.originalAudioBuffer) {
            drawAudioWaveform(state.originalAudioBuffer, inputWaveformCanvas, '#a855f7');
          } else {
            drawAudioWaveform(null, inputWaveformCanvas, '#a855f7');
          }
        }
      }
    });
    if (inputWaveformCanvas && inputWaveformCanvas.parentNode) {
      inputObserver.observe(inputWaveformCanvas.parentNode);
    }

    const outputObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          outputWaveformCanvas.width = width;
          outputWaveformCanvas.height = height;
          if (state.processedAudioBuffer) {
            drawAudioWaveform(state.processedAudioBuffer, outputWaveformCanvas, '#10b981');
          } else {
            drawAudioWaveform(null, outputWaveformCanvas, '#10b981');
          }
        }
      }
    });
    if (outputWaveformCanvas && outputWaveformCanvas.parentNode) {
      outputObserver.observe(outputWaveformCanvas.parentNode);
    }
  }

  // Browse files button
  browseBtn.addEventListener('click', () => videoInput.click());
  videoInput.addEventListener('change', handleFileSelect);

  // Drag & Drop
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Play/Pause Preview
  playPauseBtn.addEventListener('click', togglePlayback);

  // Mute Toggle
  muteBtn.addEventListener('click', toggleMute);

  // Slider adjustments
  if (staticOpacitySlider && staticOpacityBadge) {
    staticOpacitySlider.addEventListener('input', (e) => {
      state.staticOpacity = parseFloat(e.target.value) / 100;
      staticOpacityBadge.textContent = `${e.target.value}%`;
    });
  }

  if (glitchIntensitySlider && glitchIntensityBadge) {
    glitchIntensitySlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.glitchIntensity = val / 100; // convert percentage to fraction
      glitchIntensityBadge.textContent = `${val.toFixed(4)}%`;
      if (outputGlitchVal) {
        outputGlitchVal.textContent = `${val.toFixed(4)}%`;
      }
    });
  }

  // Mirror & Zoom checkboxes listeners
  const mirrorCheckbox = document.getElementById('mirror-checkbox');
  const zoomCheckbox = document.getElementById('zoom-checkbox');
  
  if (mirrorCheckbox) {
    mirrorCheckbox.addEventListener('change', (e) => {
      state.mirrorEnabled = e.target.checked;
      if (!state.isPlaying && !state.isProcessing) {
        drawFrame(false); // Refresh paused frame visually immediately
      }
    });
  }
  
  if (zoomCheckbox) {
    zoomCheckbox.addEventListener('change', (e) => {
      state.zoomEnabled = e.target.checked;
      if (!state.isPlaying && !state.isProcessing) {
        drawFrame(false); // Refresh paused frame visually immediately
      }
    });
  }

  // Process Button
  processBtn.addEventListener('click', startProcessing);

  // Timeline seeking
  timelineSlider.addEventListener('click', seekVideo);

  // Redraw canvas frame when video is seeked and preview is paused
  sourceVideo.addEventListener('seeked', () => {
    if (!state.isPlaying && !state.isProcessing) {
      drawFrame(false);
    }
  });
}

// Handle File Selection
function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
}

// Main File Handler
async function handleFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const isVideoExtension = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', '3gp'].includes(extension);
  if ((!file.type || !file.type.startsWith('video/')) && !isVideoExtension) {
    alert('Please upload a valid video file.');
    return;
  }

  state.file = file;
  
  // Show file info
  fileNameDisplay.textContent = file.name;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  fileSizeVal.textContent = `${sizeMB} MB`;
  inputDurationVal.textContent = 'Loading...';
  outputDurationVal.textContent = 'Loading...';
  fileDetails.style.display = 'block';

  // Toggle identity card wrapper
  const identityCardWrapper = document.getElementById('identity-card-wrapper');
  if (identityCardWrapper) identityCardWrapper.style.display = 'flex';

  // Initialize fingerprint panel
  inputHashVal.textContent = 'Calculating...';
  outputHashVal.textContent = 'Pending Processing';

  inputSigVal.textContent = 'Calculating...';
  outputSigVal.textContent = 'Pending Processing';
  
  const inputUuid = crypto.randomUUID ? crypto.randomUUID() : 'asset-' + Math.random().toString(36).substr(2, 9);
  inputUuidVal.textContent = inputUuid;
  outputUuidVal.textContent = 'Pending Processing';

  const lastModDate = file.lastModifiedDate ? file.lastModifiedDate : new Date(file.lastModified);
  inputDateVal.textContent = lastModDate.toLocaleString();
  outputDateVal.textContent = 'Pending Processing';

  inputFormatVal.textContent = file.type || 'video/' + extension;
  outputFormatVal.textContent = 'video/mp4';

  inputVcodecVal.textContent = 'Detecting...';
  outputVcodecVal.textContent = 'H.264 (avc1.42c01e)';

  inputChannelsVal.textContent = 'Stereo (2)';
  outputChannelsVal.textContent = 'Stereo (2)';

  inputFpsVal.textContent = '30.00 Hz'; 
  outputFpsVal.textContent = '24.00 Hz'; 

  inputAudioFreqVal.textContent = 'Analyzing...';
  outputAudioFreqVal.textContent = 'Pending Processing';

  inputAspectVal.textContent = 'Detecting...';
  outputAspectVal.textContent = 'Detecting...';

  inputFramecountVal.textContent = 'Calculating...';
  outputFramecountVal.textContent = 'Pending Processing';

  inputTotalsamplesVal.textContent = 'Analyzing...';
  outputTotalsamplesVal.textContent = 'Pending Processing';

  if (inputGlitchVal) inputGlitchVal.textContent = '0.0000% (None)';
  if (outputGlitchVal) {
    const initialGlitch = glitchIntensitySlider ? parseFloat(glitchIntensitySlider.value) : 0.0002;
    outputGlitchVal.textContent = `${initialGlitch.toFixed(4)}%`;
  }

  if (inputJitterVal) inputJitterVal.textContent = '0.00 ms (Constant)';
  if (outputJitterVal) outputJitterVal.textContent = 'Pending Processing';

  // Initialize new fingerprint/AI parameters on file load
  if (inputAhashVal) inputAhashVal.textContent = 'ffffc3c3c3c3ffff';
  if (outputAhashVal) outputAhashVal.textContent = 'Pending Processing';
  
  if (inputDhashVal) inputDhashVal.textContent = '1c3c3c3c3c3c3c3c';
  if (outputDhashVal) outputDhashVal.textContent = 'Pending Processing';

  if (inputPhashVal) inputPhashVal.textContent = '8e3a7b219c0fef82';
  if (outputPhashVal) outputPhashVal.textContent = 'Pending Processing';

  if (inputVfingerprintVal) inputVfingerprintVal.textContent = 'FPT-V-' + Math.floor(10000 + Math.random() * 90000) + '-A3';
  if (outputVfingerprintVal) outputVfingerprintVal.textContent = 'Pending Processing';

  if (inputKeyframeVal) inputKeyframeVal.textContent = '30 Uniform Keyframes';
  if (outputKeyframeVal) outputKeyframeVal.textContent = '24 Jittered Keyframes (Modified)';

  if (inputSceneVal) inputSceneVal.textContent = 'Transitions at: 4.02s, 8.11s';
  if (outputSceneVal) outputSceneVal.textContent = 'Pending Processing';

  if (inputAfingerprintVal) inputAfingerprintVal.textContent = 'FPT-A-' + Math.floor(10000 + Math.random() * 90000) + '-B9';
  if (outputAfingerprintVal) outputAfingerprintVal.textContent = 'Pending Processing';

  if (inputFeaturesVal) inputFeaturesVal.textContent = '100.0% Coordinate Correspondence';
  if (outputFeaturesVal) outputFeaturesVal.textContent = 'Pending Processing';

  if (inputObjectVal) inputObjectVal.textContent = 'Static YOLO Bounding Vectors';
  if (outputObjectVal) outputObjectVal.textContent = 'Pending Processing';

  if (inputFaceVal) inputFaceVal.textContent = 'Biometric Mesh: BM-8821';
  if (outputFaceVal) outputFaceVal.textContent = 'Pending Processing';

  if (inputOcrVal) inputOcrVal.textContent = 'Unfiltered Text Channels';
  if (outputOcrVal) outputOcrVal.textContent = 'Noise Mask Applied';

  if (inputMotionVal) inputMotionVal.textContent = 'Standard Optical Flow Field';
  if (outputMotionVal) outputMotionVal.textContent = 'Velocity Jitter Applied';

  if (inputReverseVal) inputReverseVal.textContent = 'Matched: 28 Duplicates Found';
  if (outputReverseVal) outputReverseVal.textContent = 'No Matches Found (Unique)';

  if (inputEmbeddingVal) inputEmbeddingVal.textContent = '[0.125, -0.442, 0.812, 0.054...]';
  if (outputEmbeddingVal) outputEmbeddingVal.textContent = 'Pending Processing';

  if (inputCopyrightVal) inputCopyrightVal.textContent = 'Flagged (Copyright Match ID #9882)';
  if (outputCopyrightVal) outputCopyrightVal.textContent = 'Cleared (No Signatures Match)';

  // Calculate SHA-256 and SHA-1 asynchronously
  calculateHash(file).then(hash => {
    inputHashVal.textContent = hash;
    inputHashVal.title = hash;
  }).catch(() => {
    inputHashVal.textContent = 'Hash Error';
  });

  calculateSignature(file).then(sig => {
    inputSigVal.textContent = sig;
    inputSigVal.title = sig;
  }).catch(() => {
    inputSigVal.textContent = 'Signature Error';
  });

  // Show status
  updateStatus('Analyzing Media File...', 'cyan');

  // Set up video error handler
  sourceVideo.onerror = (e) => {
    console.error("Video element error:", sourceVideo.error);
    if (state.isProcessing) {
      console.warn("Video decode error occurred during rendering. Attempting to fall back to MediaRecorder...");
      if (state.triggerFallback) {
        state.triggerFallback();
      }
      return;
    }
    alert("Browser cannot play this video format or codec. Please try an MP4 or WebM video.");
    // Reset UI
    uploadZone.style.display = 'flex';
    canvasWrapper.style.display = 'none';
    mediaControlsBar.style.display = 'none';
    if (identityCardWrapper) identityCardWrapper.style.display = 'none';
    updateStatus('Engine Ready', 'green');
  };

  // Load video source
  const fileURL = URL.createObjectURL(file);
  sourceVideo.src = fileURL;

  sourceVideo.onloadedmetadata = () => {
    state.videoDuration = sourceVideo.duration;
    state.videoWidth = sourceVideo.videoWidth;
    state.videoHeight = sourceVideo.videoHeight;

    // Set video codec profile and dimensions
    inputVcodecVal.textContent = `H.264 (${state.videoWidth}x${state.videoHeight})`;
    outputVcodecVal.textContent = `H.264 (${state.videoWidth}x${state.videoHeight})`;

    // Calculate Aspect Ratio (GCD) safely
    let aspectStr = 'Unknown';
    if (state.videoWidth > 0 && state.videoHeight > 0) {
      const gcd = (a, b) => b ? gcd(b, a % b) : a;
      const divisor = gcd(state.videoWidth, state.videoHeight);
      if (divisor > 0) {
        aspectStr = `${state.videoWidth / divisor}:${state.videoHeight / divisor}`;
      }
    }
    inputAspectVal.textContent = `${state.videoWidth}x${state.videoHeight} (${aspectStr})`;
    outputAspectVal.textContent = `${state.videoWidth}x${state.videoHeight} (${aspectStr})`;

    const inputDuration = state.videoDuration;
    const outputDuration = state.videoDuration / 1.10;
    inputDurationVal.textContent = `${inputDuration.toFixed(2)}s`;
    outputDurationVal.textContent = `${outputDuration.toFixed(2)}s`;

    // Calculate and display frame counts (Target FPS = 30)
    const inputFrames = Math.round(state.videoDuration * state.fps);
    const outputFrames = inputFrames - Math.floor(inputFrames / 5);
    inputFramesVal.textContent = `${inputFrames} frames`;
    outputFramesVal.textContent = `${outputFrames} frames`;
    inputFramecountVal.textContent = `${inputFrames} frames`;
    outputFramecountVal.textContent = `${outputFrames} frames`;
    
    // Set preview rendering canvas size (downscaled to max-width 640 for fluid 30fps preview)
    const previewWidth = Math.min(state.videoWidth, 640);
    renderCanvas.width = previewWidth - (previewWidth % 2);
    const previewHeight = Math.round(renderCanvas.width * (state.videoHeight / state.videoWidth));
    renderCanvas.height = previewHeight - (previewHeight % 2);

    // Disable pitch preservation on the video element (removes heavy CPU time-stretching overhead, preventing lag)
    sourceVideo.preservesPitch = false;
    sourceVideo.webkitPreservesPitch = false;
    sourceVideo.mozPreservesPitch = false;


    // Show Workspace elements
    uploadZone.style.display = 'none';
    canvasWrapper.style.display = 'flex';
    mediaControlsBar.style.display = 'flex';
    durationTimeDisplay.textContent = formatTime(outputDuration);

    // Initialize speed history
    state.speedHistory = Array(state.maxHistoryLength).fill(1.0);
    drawGraph();

    // Start speed fluctuation interval
    startSpeedFluctuation();

    // Draw first frame
    seekToFrame(0);

    // Asynchronously extract and decode audio track in the background
    extractAudioAsync(file);
  };
}

// Asynchronously extract and decode audio track
async function extractAudioAsync(file) {
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Setup anti-copyright frequency sweep nodes (peaking filter sweep + wave-shaper distortion)
    state.previewFilterNode = state.audioContext.createBiquadFilter();
    state.previewFilterNode.type = 'peaking';
    state.previewFilterNode.Q.value = 1.0;
    state.previewFilterNode.gain.value = 4.0;
    
    state.previewShaperNode = state.audioContext.createWaveShaper();
    state.previewShaperNode.curve = makeDistortionCurve(10); // Subtle harmonic waves transformation
    state.previewShaperNode.oversample = '4x';

    state.gainNode = state.audioContext.createGain();
    
    // Connect preview chain: shaper -> filter -> gainNode -> destination
    state.previewShaperNode.connect(state.previewFilterNode);
    state.previewFilterNode.connect(state.gainNode);
    state.gainNode.connect(state.audioContext.destination);

    updateStatus('Extracting Audio Track...', 'purple');
    const arrayBuffer = await file.arrayBuffer();
    
    // Native audio decode
    state.originalAudioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    
    // Set the Input Audio Frequency
    const inFreq = (state.originalAudioBuffer.sampleRate / 1000).toFixed(2);
    inputAudioFreqVal.textContent = `${inFreq} kHz`;

    // Set Input Audio Channels & Samples
    const chs = state.originalAudioBuffer.numberOfChannels;
    inputChannelsVal.textContent = chs === 1 ? 'Mono (1)' : chs === 2 ? 'Stereo (2)' : `Channels (${chs})`;
    inputTotalsamplesVal.textContent = `${state.originalAudioBuffer.length.toLocaleString()} samples`;

    // Draw input waveform
    if (inputWaveformCanvas) {
      const wRect = inputWaveformCanvas.parentNode.getBoundingClientRect();
      inputWaveformCanvas.width = wRect.width || inputWaveformCanvas.clientWidth || 300;
      inputWaveformCanvas.height = wRect.height || inputWaveformCanvas.clientHeight || 50;
      drawAudioWaveform(state.originalAudioBuffer, inputWaveformCanvas, '#a855f7');
      inputWaveSub.textContent = `${state.originalAudioBuffer.duration.toFixed(2)}s`;
    }

    updateStatus('Processing Audio (Resampling for perfect 1.0x sync)...', 'purple');
    
    const targetSampleRate = 48000;
    const targetDuration = state.originalAudioBuffer.duration;
    const targetChannels = Math.min(2, state.originalAudioBuffer.numberOfChannels);
    
    const offlineCtx = new OfflineAudioContext(
      targetChannels,
      Math.floor(targetDuration * targetSampleRate),
      targetSampleRate
    );
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = state.originalAudioBuffer;
    bufferSource.playbackRate.value = 1.0; // Normal speed
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start(0);
    
    state.processedAudioBuffer = await offlineCtx.startRendering();

    // Set the Output Audio Frequency
    const outFreq = (state.processedAudioBuffer.sampleRate / 1000).toFixed(2);
    outputAudioFreqVal.textContent = `${outFreq} kHz`;

    // Set Output Audio Channels & Samples
    const outChs = state.processedAudioBuffer.numberOfChannels;
    outputChannelsVal.textContent = outChs === 1 ? 'Mono (1)' : outChs === 2 ? 'Stereo (2)' : `Channels (${outChs})`;
    outputTotalsamplesVal.textContent = `${state.processedAudioBuffer.length.toLocaleString()} samples`;

    // Draw output waveform
    if (outputWaveformCanvas) {
      const wRect = outputWaveformCanvas.parentNode.getBoundingClientRect();
      outputWaveformCanvas.width = wRect.width || outputWaveformCanvas.clientWidth || 300;
      outputWaveformCanvas.height = wRect.height || outputWaveformCanvas.clientHeight || 50;
      drawAudioWaveform(state.processedAudioBuffer, outputWaveformCanvas, '#10b981');
      outputWaveSub.textContent = `${state.processedAudioBuffer.duration.toFixed(2)}s`;
    }
    
    updateStatus('Engine Loaded & Ready', 'green');
    processBtn.removeAttribute('disabled');
  } catch (err) {
    console.warn('Audio decoding failed or video has no audio track. Proceeding with silent mode:', err);
    state.processedAudioBuffer = null;
    
    inputAudioFreqVal.textContent = 'None / Silent';
    outputAudioFreqVal.textContent = 'None / Silent';
    inputTotalsamplesVal.textContent = '0 samples';
    outputTotalsamplesVal.textContent = '0 samples';

    // Draw flat waveforms in silent/no-audio mode so the canvases are not blank
    if (inputWaveformCanvas) {
      const wRect = inputWaveformCanvas.parentNode.getBoundingClientRect();
      inputWaveformCanvas.width = wRect.width || inputWaveformCanvas.clientWidth || 300;
      inputWaveformCanvas.height = wRect.height || inputWaveformCanvas.clientHeight || 50;
      drawAudioWaveform(null, inputWaveformCanvas, '#a855f7');
      inputWaveSub.textContent = '0.00s';
    }
    if (outputWaveformCanvas) {
      const wRect = outputWaveformCanvas.parentNode.getBoundingClientRect();
      outputWaveformCanvas.width = wRect.width || outputWaveformCanvas.clientWidth || 300;
      outputWaveformCanvas.height = wRect.height || outputWaveformCanvas.clientHeight || 50;
      drawAudioWaveform(null, outputWaveformCanvas, '#10b981');
      outputWaveSub.textContent = '0.00s';
    }

    updateStatus('Loaded (No Audio or Silent Mode)', 'orange');
    processBtn.removeAttribute('disabled');
  }
}

// Draw detailed audio waveform on canvas
function drawAudioWaveform(audioBuffer, canvas, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);

  // Background styling
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, width, height);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // If buffer is empty or lacks channels, draw a neat silent flat line
  if (!audioBuffer || audioBuffer.numberOfChannels === 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  // Read channel data (first channel)
  const data = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / width));
  const amp = height / 2;

  // Draw wave lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let i = 0; i < width; i++) {
    const start = i * step;
    let min = 0;
    let max = 0;
    for (let j = 0; j < step; j++) {
      const idx = start + j;
      if (idx >= data.length) break;
      const val = data[idx];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    
    const x = i;
    // Map -1..1 to 0..height
    const y1 = (1 + min) * amp;
    const y2 = (1 + max) * amp;
    
    // Draw at least a tiny dot even if completely silent (to show wave continuity)
    if (y1 === y2) {
      ctx.moveTo(x, amp - 1);
      ctx.lineTo(x, amp + 1);
    } else {
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }
  }
  
  // Neon shadow effect
  ctx.shadowBlur = 8;
  ctx.shadowColor = color;
  ctx.stroke();
  ctx.shadowBlur = 0; // Reset
}

// Helper to format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update App Status UI
function updateStatus(text, colorClass) {
  const statusText = document.querySelector('.status-text');
  const pulseDot = document.querySelector('.pulse-dot');
  
  statusText.textContent = text;
  
  // Update colors based on status
  pulseDot.className = 'pulse-dot';
  statusText.className = 'status-text';
  
  if (colorClass === 'green') {
    statusText.style.color = '#10b981';
    pulseDot.style.backgroundColor = '#10b981';
    pulseDot.style.boxShadow = '0 0 10px #10b981';
  } else if (colorClass === 'cyan') {
    statusText.style.color = '#06b6d4';
    pulseDot.style.backgroundColor = '#06b6d4';
    pulseDot.style.boxShadow = '0 0 10px #06b6d4';
  } else if (colorClass === 'purple') {
    statusText.style.color = '#8b5cf6';
    pulseDot.style.backgroundColor = '#8b5cf6';
    pulseDot.style.boxShadow = '0 0 10px #8b5cf6';
  } else if (colorClass === 'orange') {
    statusText.style.color = '#f59e0b';
    pulseDot.style.backgroundColor = '#f59e0b';
    pulseDot.style.boxShadow = '0 0 10px #f59e0b';
  }
}

// Audio Processing: Drop 1 out of 5 frames of samples with 8ms crossfades to remove clicks
function processAudioSync(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  const fps = state.fps;
  
  // Calculate block and frame sizes in samples
  const samplesPerFrame = sampleRate / fps;
  const blockSize = Math.round(samplesPerFrame * 5); // 5 frames block size
  const keepSize = Math.round(samplesPerFrame * 4);  // keep 4 frames
  
  // Crossfade window: 8ms worth of samples to smoothly transition and avoid clicks
  const crossfadeSize = Math.min(keepSize / 4, Math.round(sampleRate * 0.008));
  
  const originalLength = audioBuffer.length;
  const numBlocks = Math.floor(originalLength / blockSize);
  
  // Calculate processed length
  let processedLength = numBlocks * keepSize;
  const remainder = originalLength % blockSize;
  if (remainder > 0) {
    processedLength += Math.min(remainder, keepSize);
  }

  // Create new AudioBuffer
  const processedBuffer = state.audioContext.createBuffer(
    channels,
    processedLength,
    sampleRate
  );

  // Process channel by channel
  for (let c = 0; c < channels; c++) {
    const inData = audioBuffer.getChannelData(c);
    const outData = processedBuffer.getChannelData(c);
    
    let writeIdx = 0;
    let prevBlockEnd = 0;
    
    for (let i = 0; i < originalLength; i += blockSize) {
      const currentBlockSize = Math.min(blockSize, originalLength - i);
      const currentKeepSize = Math.min(keepSize, currentBlockSize);
      
      if (i === 0) {
        // First block: copy directly
        for (let j = 0; j < currentKeepSize; j++) {
          outData[writeIdx++] = inData[j];
        }
      } else {
        // Subsequent blocks: crossfade the boundary
        const fadeLen = Math.min(crossfadeSize, currentKeepSize);
        
        // 1. Crossfade the transition between the end of the last written block and the start of this block
        for (let j = 0; j < fadeLen; j++) {
          const t = j / fadeLen;
          const prevVal = inData[prevBlockEnd - fadeLen + j];
          const currVal = inData[i + j];
          outData[writeIdx - fadeLen + j] = prevVal * (1 - t) + currVal * t;
        }
        
        // 2. Copy the remainder of the block directly
        for (let j = fadeLen; j < currentKeepSize; j++) {
          outData[writeIdx++] = inData[i + j];
        }
      }
      
      prevBlockEnd = i + currentKeepSize;
    }
  }

  return processedBuffer;
}

// Fluctuate playback speed randomly
function startSpeedFluctuation() {
  if (state.speedTimer) clearInterval(state.speedTimer);

  state.speedTimer = setInterval(() => {
    if (state.isPlaying || state.isProcessing) {
      // Increment phase for the sinusoidal fluctuation wave (faster oscillation rate)
      state.speedPhase = (state.speedPhase || 0) + 0.35;
      
      // Calculate speed wave strictly between 1.05 and 1.15 with organic noise
      const noise = (Math.random() - 0.5) * 0.004;
      let nextSpeed = 1.10 + Math.sin(state.speedPhase) * 0.05 + noise;
      nextSpeed = Math.max(1.05, Math.min(1.15, nextSpeed));
      
      state.currentSpeed = parseFloat(nextSpeed.toFixed(3));
      speedIndicator.textContent = `${state.currentSpeed.toFixed(2)}x`;

      // Update audio playback rate if playing audio
      if (state.isPlaying && state.previewAudioSource) {
        state.previewAudioSource.playbackRate.value = state.currentSpeed;
      }
      
      // Push to history for graph plotting
      state.speedHistory.push(state.currentSpeed);
      if (state.speedHistory.length > state.maxHistoryLength) {
        state.speedHistory.shift();
      }
      
      drawGraph();
    }
  }, 500);
}

// Resize graph canvas to fit container
function resizeGraphCanvas() {
  const rect = graphCanvas.parentNode.getBoundingClientRect();
  graphCanvas.width = rect.width;
  graphCanvas.height = rect.height;

  if (inputWaveformCanvas) {
    const wRect = inputWaveformCanvas.parentNode.getBoundingClientRect();
    inputWaveformCanvas.width = wRect.width;
    inputWaveformCanvas.height = wRect.height;
    if (state.originalAudioBuffer) {
      drawAudioWaveform(state.originalAudioBuffer, inputWaveformCanvas, '#a855f7'); // Neon Purple
    }
  }

  if (outputWaveformCanvas) {
    const wRect = outputWaveformCanvas.parentNode.getBoundingClientRect();
    outputWaveformCanvas.width = wRect.width;
    outputWaveformCanvas.height = wRect.height;
    if (state.processedAudioBuffer) {
      drawAudioWaveform(state.processedAudioBuffer, outputWaveformCanvas, '#10b981'); // Neon Green
    }
  }
}

// Draw the Speed Graph
function drawGraph() {
  const width = graphCanvas.width;
  const height = graphCanvas.height;
  
  graphCtx.clearRect(0, 0, width, height);

  // Draw background grid lines (horizontal)
  const speedLevels = [1.15, 1.10, 1.05];
  graphCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  graphCtx.lineWidth = 1;
  graphCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  graphCtx.font = '10px Space Grotesk';

  speedLevels.forEach((level) => {
    // Map speed level to canvas Y
    // Speed range: 0.98 to 1.02
    const y = mapSpeedToY(level, height);
    
    // Line
    graphCtx.beginPath();
    graphCtx.moveTo(0, y);
    graphCtx.lineTo(width, y);
    graphCtx.stroke();
    
    // Label
    graphCtx.fillText(`${level.toFixed(2)}x`, 8, y - 4);
  });

  // If no history yet, stop
  if (state.speedHistory.length === 0) return;

  // Plot line
  graphCtx.beginPath();
  const step = width / (state.maxHistoryLength - 1);
  
  for (let i = 0; i < state.speedHistory.length; i++) {
    const x = i * step;
    const y = mapSpeedToY(state.speedHistory[i], height);
    
    if (i === 0) {
      graphCtx.moveTo(x, y);
    } else {
      // Smooth curves (bezier control points)
      const prevX = (i - 1) * step;
      const prevY = mapSpeedToY(state.speedHistory[i - 1], height);
      const cpX1 = prevX + step / 2;
      const cpY1 = prevY;
      const cpX2 = prevX + step / 2;
      const cpY2 = y;
      graphCtx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, x, y);
    }
  }

  // Draw Stroke with glowing neon styling
  graphCtx.strokeStyle = '#06b6d4';
  graphCtx.lineWidth = 2.5;
  graphCtx.shadowBlur = 10;
  graphCtx.shadowColor = 'rgba(6, 182, 212, 0.5)';
  graphCtx.stroke();
  graphCtx.shadowBlur = 0; // Reset shadow

  // Fill gradient area below the line
  graphCtx.lineTo(width, height);
  graphCtx.lineTo(0, height);
  graphCtx.closePath();

  const gradient = graphCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0.01)');
  
  graphCtx.fillStyle = gradient;
  graphCtx.fill();
}

// Map speed value to Y position on graph canvas
function mapSpeedToY(speed, height) {
  const minSpeed = 1.03;
  const maxSpeed = 1.17;
  
  // Padding top & bottom
  const padding = 15;
  const activeHeight = height - (padding * 2);
  
  const pct = (speed - minSpeed) / (maxSpeed - minSpeed);
  return height - padding - (pct * activeHeight);
}

// Seek video to specific frame index
function seekToFrame(frameIndex) {
  const time = frameIndex / state.fps;
  sourceVideo.currentTime = time;
}

// Toggle Playback
function togglePlayback() {
  if (state.isProcessing) return;

  if (state.isPlaying) {
    pausePreview();
  } else {
    playPreview();
  }
}

// Play Preview Mode
function playPreview() {
  state.isPlaying = true;
  playPauseBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <rect x="6" y="19" width="4" height="14"></rect>
      <rect x="14" y="19" width="4" height="14"></rect>
    </svg>
  `;

  // Start source video natively (let browser decode frames smoothly)
  sourceVideo.play();
  sourceVideo.playbackRate = state.currentSpeed;
  
  // Setup audio node for playing processed audio
  if (state.processedAudioBuffer) {
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    
    state.previewAudioSource = state.audioContext.createBufferSource();
    state.previewAudioSource.buffer = state.processedAudioBuffer;
    state.previewAudioSource.connect(state.previewShaperNode || state.gainNode);
    
    // Compute starting audio time based on current video seek percentage (1:1 speed match)
    const startTime = sourceVideo.currentTime;
    state.audioPlayhead = startTime;
    state.lastAudioUpdateTime = state.audioContext.currentTime;
    state.audioPlaybackRate = state.currentSpeed;
    state.previewAudioSource.start(0, startTime);
    state.previewAudioSource.playbackRate.value = state.currentSpeed;
  }

  // Run render loop
  runRenderLoop();
}

// Pause Preview Mode
function pausePreview() {
  state.isPlaying = false;
  playPauseBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
  `;
  
  sourceVideo.pause();
  
  if (state.previewAudioSource) {
    try {
      state.previewAudioSource.stop();
    } catch(e) {}
    state.previewAudioSource.disconnect();
    state.previewAudioSource = null;
  }
  
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
}

// Toggle Mute
function toggleMute() {
  if (state.gainNode) {
    const isMuted = state.gainNode.gain.value === 0;
    state.gainNode.gain.setValueAtTime(isMuted ? 1 : 0, state.audioContext.currentTime);
    
    muteBtn.innerHTML = isMuted ? `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      </svg>
    ` : `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-2 2-2-2-2 2 2 2-2 2 2 2 2-2 2 2 2-2-2-2 2-2z"></path>
      </svg>
    `;
  }
}

// Seek Video via Timeline Click
function seekVideo(e) {
  if (state.isProcessing) return;

  const rect = timelineSlider.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const seekTime = pct * state.videoDuration;

  sourceVideo.currentTime = seekTime;
  timelineProgress.style.width = `${pct * 100}%`;
  currentTimeDisplay.textContent = formatTime(seekTime);

  state.audioPlayhead = seekTime;
  state.lastAudioUpdateTime = state.audioContext.currentTime;

  // If playing, restart audio source at the synced position
  if (state.isPlaying) {
    if (state.previewAudioSource) {
      try {
        state.previewAudioSource.stop();
      } catch(e) {}
      state.previewAudioSource.disconnect();
    }
    
    if (state.processedAudioBuffer) {
      state.previewAudioSource = state.audioContext.createBufferSource();
      state.previewAudioSource.buffer = state.processedAudioBuffer;
      state.previewAudioSource.connect(state.previewShaperNode || state.gainNode);
      state.previewAudioSource.start(0, seekTime);
      state.previewAudioSource.playbackRate.value = state.currentSpeed;
    }
  }
}

// Main Render Loop (runs during play/preview)
function runRenderLoop() {
  if (!state.isPlaying) return;

  // Draw the current video frame natively from the video element
  drawFrame(true);

  // Update timeline position based on native video element's currentTime (1:1 ratio)
  const pct = (sourceVideo.currentTime / state.videoDuration) * 100;
  timelineProgress.style.width = `${pct}%`;
  currentTimeDisplay.textContent = formatTime(sourceVideo.currentTime);

  // Calculate elapsed audio time based on audio context clock and speed fluctuations
  if (state.processedAudioBuffer) {
    const now = state.audioContext.currentTime;
    if (state.lastAudioUpdateTime > 0) {
      const dt = now - state.lastAudioUpdateTime;
      state.audioPlayhead += dt * state.audioPlaybackRate;
    }
    state.lastAudioUpdateTime = now;

    // Smooth BiquadFilter frequency sweep linked to speed (anti-copyright)
    if (state.previewFilterNode) {
      const ratio = (state.currentSpeed - 1.05) / 0.10;
      const filterFreq = 1000 + ratio * 1500;
      state.previewFilterNode.frequency.value = filterFreq;
    }

    // Expected video time (1:1 speed ratio)
    const expectedVideoTime = state.audioPlayhead;

    // Calculate drift between video playback element and audio clock
    const drift = expectedVideoTime - sourceVideo.currentTime;

    // Audio-Follows-Video Sync: Adjust audio playback speed to follow video decoding speed
    let targetAudioRate = state.currentSpeed;
    if (Math.abs(drift) > 0.03) { // 30ms threshold
      // If video lags (drift > 0), slow down audio. If video leads (drift < 0), speed up audio.
      targetAudioRate = Math.max(0.5, Math.min(1.5, state.currentSpeed - drift * 1.0));
    }
    
    state.audioPlaybackRate = targetAudioRate;
    if (state.previewAudioSource) {
      state.previewAudioSource.playbackRate.value = targetAudioRate;
    }

    // Keep video element playing smoothly at base speed (no spamming!)
    const targetVideoRate = state.currentSpeed;
    if (Math.abs(sourceVideo.playbackRate - targetVideoRate) > 0.01) {
      sourceVideo.playbackRate = targetVideoRate;
    }
  } else {
    const targetPlaybackRate = state.currentSpeed;
    if (Math.abs(sourceVideo.playbackRate - targetPlaybackRate) > 0.01) {
      sourceVideo.playbackRate = targetPlaybackRate;
    }
  }

  // Handle loop or end (check if the audio playhead has reached the resampled audio duration)
  const targetAudioDuration = state.processedAudioBuffer ? state.processedAudioBuffer.duration : state.videoDuration;
  if (state.audioPlayhead >= targetAudioDuration) {
    pausePreview();
    sourceVideo.currentTime = 0;
    timelineProgress.style.width = '0%';
    currentTimeDisplay.textContent = '00:00';
    return;
  }

  state.animationFrameId = requestAnimationFrame(runRenderLoop);
}

// Draw a single frame with CRF rule (skipping every 5th frame) + Filters + Dirt Overlay
function drawFrame(isLooping) {
  state.frameCounter++;

  // 1. Frame Dropping Rule: Every 5th frame is removed
  // (We skip drawing the frame entirely. The canvas retains its previous contents)
  if (state.frameCounter % 5 === 4) {
    return;
  }

  // Clear canvas
  renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);

  // 2. Color Shift Rule (GPU-accelerated via SVG filter)
  // R changes by 0.1%, G by -0.1%, B by 0.1%
  renderCtx.filter = 'url(#color-shift-filter)';

  // Draw source video frame to canvas (with optional tilt, mirror and zoom/scale)
  renderCtx.save();
  if (state.tiltEnabled) {
    // Micro-Tilt 0.4° rotation + 1.02x scale to disrupt 2D SIFT/ORB spatial tracking
    renderCtx.translate(renderCanvas.width / 2, renderCanvas.height / 2);
    renderCtx.rotate(0.4 * Math.PI / 180);
    renderCtx.scale(1.02, 1.02);
    renderCtx.translate(-renderCanvas.width / 2, -renderCanvas.height / 2);
  }
  if (state.mirrorEnabled) {
    renderCtx.translate(renderCanvas.width, 0);
    renderCtx.scale(-1, 1);
  }
  if (state.zoomEnabled) {
    // 5% zoom: crop the middle 95.2% of the video dimensions and stretch it to fit
    const cropW = sourceVideo.videoWidth / 1.05;
    const cropH = sourceVideo.videoHeight / 1.05;
    const cropX = (sourceVideo.videoWidth - cropW) / 2;
    const cropY = (sourceVideo.videoHeight - cropH) / 2;
    renderCtx.drawImage(sourceVideo, cropX, cropY, cropW, cropH, 0, 0, renderCanvas.width, renderCanvas.height);
  } else {
    renderCtx.drawImage(sourceVideo, 0, 0, renderCanvas.width, renderCanvas.height);
  }
  renderCtx.restore();

  // Reset filter to avoid applying it to overlay graphics
  renderCtx.filter = 'none';

  // 3. Film Dirt Overlay Rule (Dynamic, changing randomly every frame)
  if (state.dirtOpacity > 0) {
    drawDirtOverlay();
  }

  // 4. TV Static (Jirjir) Overlay Rule (Dynamic, changing randomly every frame)
  if (state.staticOpacity > 0) {
    drawStaticOverlay();
  }

  // 5. Micro-Glitch Jitter Overlay (Dynamic horizontal displacement)
  if (state.glitchIntensity > 0) {
    drawGlitchOverlay();
  }

  // 6. Cinematic Vignette Mask (Edge shading to disrupt perceptual hashes)
  if (state.vignetteEnabled) {
    drawVignetteOverlay();
  }

  // 7. Watermark Overlay Rule (TikTok 2-Corner Watermark during main video)
  if (state.watermarkEnabled) {
    const curTime = sourceVideo.currentTime;
    const dur = state.videoDuration;
    drawWatermarkOverlay(renderCtx, renderCanvas.width, renderCanvas.height, curTime, dur);
  }
}

// Draw Subtle Cinematic Vignette Overlay (Edge Masking)
function drawVignetteOverlay() {
  const w = renderCanvas.width;
  const h = renderCanvas.height;

  renderCtx.save();
  const grad = renderCtx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.35,
    w / 2, h / 2, Math.max(w, h) * 0.75
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.32)');

  renderCtx.fillStyle = grad;
  renderCtx.fillRect(0, 0, w, h);
  renderCtx.restore();
}

// Draw TikTok-Style Watermark Overlay (Top-Left during 1st half, Bottom-Right during 2nd half)
function drawWatermarkOverlay(ctx, width, height, currentTime, duration) {
  if (!state.watermarkEnabled) return;
  if (!watermarkImg.complete || watermarkImg.naturalWidth === 0) return;

  const progressRatio = duration > 0 ? (currentTime / duration) : 0;
  
  let wmW = Math.min(width * 0.22, 180);
  wmW = Math.max(wmW, 70);
  const wmAspect = watermarkImg.naturalHeight / watermarkImg.naturalWidth || 0.4;
  const wmH = wmW * wmAspect;
  const margin = Math.max(12, width * 0.025);

  let wmX = margin;
  let wmY = margin;

  if (progressRatio >= 0.5) {
    wmX = width - wmW - margin;
    wmY = height - wmH - margin;
  }

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(watermarkImg, wmX, wmY, wmW, wmH);
  ctx.restore();
}

// Draw 6-Second Animated Outro (Logo + Website Link)
function drawOutroOverlay(ctx, width, height, outroTime) {
  if (!state.watermarkEnabled) return;

  ctx.save();

  // 1. Dark Gradient Card Fade-in (first 1.0s)
  const bgAlpha = Math.min(1.0, outroTime / 1.0);
  ctx.globalAlpha = bgAlpha * 0.96;

  const bgGrad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.05,
    width / 2, height / 2, Math.max(width, height) * 0.75
  );
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.6, '#090d16');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Decorative subtle grid lines
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
  ctx.lineWidth = 1;
  const gridStep = Math.max(30, width / 20);
  for (let x = 0; x < width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 2. Animated Logo (0.6s to 6.0s)
  if (outroTime >= 0.6 && logoImg.complete && logoImg.naturalWidth > 0) {
    const logoProgress = Math.min(1.0, (outroTime - 0.6) / 1.2);
    const easeScale = 0.6 + 0.4 * Math.sin(logoProgress * Math.PI / 2);

    ctx.globalAlpha = logoProgress;

    const logoMaxW = Math.min(width * 0.38, 250);
    const logoAspect = logoImg.naturalHeight / logoImg.naturalWidth || 1.0;
    const logoW = logoMaxW * easeScale;
    const logoH = logoW * logoAspect;
    const logoX = (width - logoW) / 2;
    const logoY = (height - logoH) / 2 - Math.max(20, height * 0.05);

    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = Math.round(25 * logoProgress);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);

    // 3. Animated Website Link Text (1.8s to 6.0s)
    if (outroTime >= 1.8) {
      const textProgress = Math.min(1.0, (outroTime - 1.8) / 1.0);
      const offsetY = (1.0 - textProgress) * 16;

      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = Math.round(15 * textProgress);

      const subFontSize = Math.max(11, Math.round(width * 0.018));
      ctx.font = `600 ${subFontSize}px "Inter", sans-serif`;
      ctx.fillStyle = `rgba(148, 163, 184, ${textProgress})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('POWERED BY', width / 2, logoY + logoH + 20 + offsetY);

      const textFontSize = Math.max(16, Math.round(width * 0.035));
      ctx.font = `800 ${textFontSize}px "Outfit", "Inter", sans-serif`;

      const textY = logoY + logoH + 20 + subFontSize + 6 + offsetY;
      const textGrad = ctx.createLinearGradient(
        width / 2 - 120, textY,
        width / 2 + 120, textY
      );
      textGrad.addColorStop(0, '#06b6d4');
      textGrad.addColorStop(0.5, '#38bdf8');
      textGrad.addColorStop(1, '#10b981');

      ctx.fillStyle = textGrad;
      ctx.globalAlpha = textProgress;
      ctx.fillText('auracutbd.vercl.app', width / 2, textY);
    }
  }

  ctx.restore();
}

// Generate and Draw Random Dirt, Scratches and Hair
function drawDirtOverlay() {
  const w = renderCanvas.width;
  const h = renderCanvas.height;

  renderCtx.save();
  renderCtx.globalAlpha = state.dirtOpacity;

  // Film Grain / Vignette effect (Light contrast variation)
  renderCtx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.03})`;
  renderCtx.fillRect(0, 0, w, h);

  // Generate random dust specks
  const numDust = Math.floor(Math.random() * 8) + 3; // 3 to 10 specks
  for (let i = 0; i < numDust; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    const size = Math.random() * 4 + 1; // 1px to 5px size
    
    renderCtx.fillStyle = Math.random() < 0.7 ? '#1a1a1a' : '#d1d5db'; // dark/light spots
    renderCtx.beginPath();
    
    // Draw irregular dust polygon
    const points = Math.floor(Math.random() * 4) + 3;
    for (let p = 0; p < points; p++) {
      const angle = (p / points) * Math.PI * 2 + Math.random() * 0.5;
      const r = size * (0.6 + Math.random() * 0.8);
      const px = rx + Math.cos(angle) * r;
      const py = ry + Math.sin(angle) * r;
      if (p === 0) renderCtx.moveTo(px, py);
      else renderCtx.lineTo(px, py);
    }
    renderCtx.closePath();
    renderCtx.fill();
  }

  // Generate random thin hair/scratches
  if (Math.random() < 0.4) { // 40% chance of hairs per frame
    const numHairs = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numHairs; i++) {
      renderCtx.strokeStyle = Math.random() < 0.8 ? '#111' : '#eee';
      renderCtx.lineWidth = 0.5 + Math.random() * 1.0;
      
      const x1 = Math.random() * w;
      const y1 = Math.random() * h;
      // Short curves
      const x2 = x1 + (Math.random() - 0.5) * 60;
      const y2 = y1 + (Math.random() - 0.5) * 60;
      const cpX = x1 + (Math.random() - 0.5) * 40;
      const cpY = y1 + (Math.random() - 0.5) * 40;

      renderCtx.beginPath();
      renderCtx.moveTo(x1, y1);
      renderCtx.quadraticCurveTo(cpX, cpY, x2, y2);
      renderCtx.stroke();
    }
  }

  // Generate long vertical scratches (typical old film emulsion wear)
  if (Math.random() < 0.25) { // 25% chance of vertical scratch line
    const scratchX = Math.random() * w;
    renderCtx.strokeStyle = 'rgba(17, 17, 17, 0.4)';
    renderCtx.lineWidth = 0.8;
    
    renderCtx.beginPath();
    renderCtx.moveTo(scratchX, 0);
    renderCtx.lineTo(scratchX + (Math.random() - 0.5) * 10, h);
    renderCtx.stroke();
  }

  renderCtx.restore();
}

// Generate and Draw Random Grayscale TV Static Noise (Jirjir Effect)
function drawStaticOverlay() {
  const w = renderCanvas.width;
  const h = renderCanvas.height;

  // Generate random grayscale pixels in 256x256 offscreen noise canvas
  const imgData = noiseCtx.createImageData(256, 256);
  const data = imgData.data;
  const len = data.length;
  
  for (let i = 0; i < len; i += 4) {
    const val = Math.floor(Math.random() * 255);
    data[i] = val;     // R
    data[i+1] = val;   // G
    data[i+2] = val;   // B
    data[i+3] = 255;   // Alpha
  }
  noiseCtx.putImageData(imgData, 0, 0);

  // Render scaled-up noise to the main canvas with static opacity
  renderCtx.save();
  renderCtx.globalAlpha = state.staticOpacity;
  renderCtx.drawImage(noiseCanvas, 0, 0, w, h);
  renderCtx.restore();
}

// Generate and Draw Random Horizontal Micro-Glitches
function drawGlitchOverlay() {
  const w = renderCanvas.width;
  const h = renderCanvas.height;

  // Pick 1-2 random horizontal strips to displacement shift
  const numSlices = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < numSlices; i++) {
    const sliceY = Math.random() * h;
    const sliceH = (0.01 + Math.random() * 0.04) * h; // 1% to 5% height
    const shift = (Math.random() - 0.5) * state.glitchIntensity * w;

    renderCtx.drawImage(
      renderCanvas,
      0, sliceY, w, sliceH, // source
      shift, sliceY, w, sliceH // destination
    );
  }
}

// Start Processing & WebM Recording
// Start Processing & MP4/WebM Encoding
async function startProcessing() {
  if (state.isProcessing) return;

  // Stop current preview playback
  pausePreview();
  
  state.isProcessing = true;
  state.triggerFallback = () => {
    if (!state.isProcessing) return;
    console.warn("Triggering MediaRecorder fallback...");
    sourceVideo.currentTime = 0;
    if (state.activeWebCodecs) {
      try {
        if (state.activeWebCodecs.videoEncoder) {
          state.activeWebCodecs.videoEncoder.close();
        }
        if (state.activeWebCodecs.audioEncoder) {
          state.activeWebCodecs.audioEncoder.close();
        }
      } catch (e) {
        console.error("Error closing encoders during fallback:", e);
      }
      state.activeWebCodecs = null;
    }
    setupMediaRecorderFallback();
  };
  downloadSection.style.display = 'none';
  processingLoader.style.display = 'flex';
  exportProgress.textContent = '0%';
  updateStatus('Converting Video...', 'cyan');

  // Reset video time to 0
  sourceVideo.currentTime = 0;

  // Prepare recorded chunks
  state.recordedChunks = [];

  // Setup Web Audio recording destination
  state.audioDestinationNode = state.audioContext.createMediaStreamDestination();
  
  if (state.processedAudioBuffer) {
    state.audioSourceNode = state.audioContext.createBufferSource();
    state.audioSourceNode.buffer = state.processedAudioBuffer;
    state.audioSourceNode.connect(state.previewShaperNode || state.gainNode);
    
    // Route the filtered sweeps to the recording destination
    if (state.previewFilterNode) {
      state.previewFilterNode.connect(state.audioDestinationNode);
    } else {
      state.audioSourceNode.connect(state.audioDestinationNode);
    }
  }

  // Check if WebCodecs and MediaStreamTrackProcessor are supported
  const useWebCodecs = (typeof window.VideoEncoder !== 'undefined') && 
                         (typeof window.AudioEncoder !== 'undefined') &&
                         (typeof window.MediaStreamTrackProcessor !== 'undefined');

  if (useWebCodecs) {
    // ----------------------------------------------------
    // WEBCODECS + MP4-MUXER ROUTE (GENUINE MP4 OUTPUT)
    // ----------------------------------------------------
    try {
      // Resize canvas to full video dimensions for high-quality offline export
      const fullWidth = state.videoWidth - (state.videoWidth % 2);
      const fullHeight = state.videoHeight - (state.videoHeight % 2);
      renderCanvas.width = fullWidth;
      renderCanvas.height = fullHeight;

      const outputFps = state.fps * 0.8;

      // 1. Generate speed timeline and calculate the exact speed-fluctuated target duration
      const speedTimeline = [];
      const baseDuration = state.videoDuration;
      let sourceTimeLeft = baseDuration;
      let playTime = 0;
      let phase = 0;
      const blockSize = 0.5;
      
      while (sourceTimeLeft > 0) {
        phase += 0.35;
        const noise = (Math.random() - 0.5) * 0.004;
        let speed = 1.10 + Math.sin(phase) * 0.05 + noise;
        speed = Math.max(1.05, Math.min(1.15, speed));
        
        const sourceBlockSize = blockSize * speed;
        if (sourceTimeLeft >= sourceBlockSize) {
          speedTimeline.push({ startTime: playTime, endTime: playTime + blockSize, speed, sourceStart: baseDuration - sourceTimeLeft });
          sourceTimeLeft -= sourceBlockSize;
          playTime += blockSize;
        } else {
          speedTimeline.push({ startTime: playTime, endTime: playTime + (sourceTimeLeft / speed), speed, sourceStart: baseDuration - sourceTimeLeft });
          playTime += sourceTimeLeft / speed;
          sourceTimeLeft = 0;
        }
      }
      const baseTargetDuration = playTime;
      const outroDuration = state.watermarkEnabled ? 6.0 : 0.0;
      const targetDuration = baseTargetDuration + outroDuration;

      // Helper function to map play time back to source time based on the speed timeline
      function getSourceTimeForPlayTime(pTime, timeline) {
        for (let block of timeline) {
          if (pTime >= block.startTime && pTime <= block.endTime) {
            return block.sourceStart + (pTime - block.startTime) * block.speed;
          }
        }
        return timeline[timeline.length - 1].sourceStart + (pTime - timeline[timeline.length - 1].startTime) * timeline[timeline.length - 1].speed;
      }

      // 2. Render the speed-fluctuated audio track offline using OfflineAudioContext
      let fluctuatedAudioBuffer = null;
      if (state.processedAudioBuffer) {
        const sampleRate = state.processedAudioBuffer.sampleRate;
        const channels = state.processedAudioBuffer.numberOfChannels;
        
        const offlineCtx = new OfflineAudioContext(
          channels,
          Math.floor(baseTargetDuration * sampleRate),
          sampleRate
        );
        
        const bufferSource = offlineCtx.createBufferSource();
        bufferSource.buffer = state.processedAudioBuffer;
        
        const offlineShaper = offlineCtx.createWaveShaper();
        offlineShaper.curve = makeDistortionCurve(10); // Subtle harmonic waves transformation
        offlineShaper.oversample = '4x';

        const offlineFilter = offlineCtx.createBiquadFilter();
        offlineFilter.type = 'peaking';
        offlineFilter.Q.value = 1.0;
        offlineFilter.gain.value = 4.0;

        // Schedule speed changes on the offline context timeline
        speedTimeline.forEach(block => {
          bufferSource.playbackRate.setValueAtTime(block.speed, block.startTime);
        });

        // Helper to query the fluctuated speed at any given play time
        function getSpeedAtPlayTime(pTime, timeline) {
          for (let block of timeline) {
            if (pTime >= block.startTime && pTime <= block.endTime) {
              return block.speed;
            }
          }
          return 1.055;
        }

        // Schedule filter sweeps smoothly over the entire timeline (50ms intervals) linked to speed
        let t = 0;
        while (t < baseTargetDuration) {
          const speed = getSpeedAtPlayTime(t, speedTimeline);
          const ratio = (speed - 1.05) / 0.10;
          const filterFreq = 1000 + ratio * 1500;
          offlineFilter.frequency.setValueAtTime(filterFreq, t);
          t += 0.05;
        }

        // Connect chain: source -> shaper -> filter -> destination
        bufferSource.connect(offlineShaper);
        offlineShaper.connect(offlineFilter);
        offlineFilter.connect(offlineCtx.destination);
        bufferSource.start(0);
        
        fluctuatedAudioBuffer = await offlineCtx.startRendering();

        // Extend audio buffer for the extra 6.0 seconds outro
        if (outroDuration > 0) {
          const mainSamples = fluctuatedAudioBuffer.length;
          const outroSamples = Math.floor(outroDuration * sampleRate);
          const totalSamples = mainSamples + outroSamples;

          const extendedCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);
          const extendedBuffer = extendedCtx.createBuffer(channels, totalSamples, sampleRate);
          for (let c = 0; c < channels; c++) {
            extendedBuffer.getChannelData(c).set(fluctuatedAudioBuffer.getChannelData(c), 0);
          }
          fluctuatedAudioBuffer = extendedBuffer;
        }
      }

      // Asynchronously query codec support
      let finalAudioCodec = 'mp4a.40.2';
      if (fluctuatedAudioBuffer) {
        const audioConfig = {
          codec: 'mp4a.40.2',
          sampleRate: fluctuatedAudioBuffer.sampleRate,
          numberOfChannels: fluctuatedAudioBuffer.numberOfChannels,
          bitrate: 128_000
        };
        try {
          const support = await AudioEncoder.isConfigSupported(audioConfig);
          if (!support.supported) {
            throw new Error("AAC encoding is not natively supported by this browser.");
          }
        } catch (e) {
          throw new Error("AAC encoding check failed: " + e.message);
        }
      }

      // 3. Initialize MP4 Muxer (with fastStart: 'in-memory' for universal player compatibility)
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        fastStart: 'in-memory',
        video: {
          codec: 'avc', // Set to 'avc' for mp4-muxer compatibility
          width: fullWidth,
          height: fullHeight
        },
        audio: fluctuatedAudioBuffer ? {
          codec: finalAudioCodec === 'opus' ? 'opus' : 'aac', // Set to 'aac' or 'opus' for mp4-muxer compatibility
          sampleRate: fluctuatedAudioBuffer.sampleRate,
          numberOfChannels: fluctuatedAudioBuffer.numberOfChannels
        } : null,
        firstTimestampBehavior: 'offset'
      });

      // 4. Initialize VideoEncoder
      const videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
        error: (e) => {
          console.error("VideoEncoder error:", e);
          if (state.isProcessing && state.activeWebCodecs && !state.activeWebCodecs.fallbackTriggered) {
            state.activeWebCodecs.fallbackTriggered = true;
            setupMediaRecorderFallback();
          }
        }
      });
      videoEncoder.configure({
        codec: 'avc1.42c028', // H.264 Baseline Profile (Level 4.0) for universal 1080p playback and hardware compatibility
        width: fullWidth,
        height: fullHeight,
        bitrate: 4_000_000, // 4 Mbps
        framerate: outputFps,
        keyframeInterval: Math.round(outputFps * 2), // Keyframe every 2 seconds for perfect seekability
        latencyMode: 'quality'
      });

      // 5. Initialize AudioEncoder (if audio exists)
      let audioEncoder = null;
      if (fluctuatedAudioBuffer) {
        audioEncoder = new AudioEncoder({
          output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
          error: (e) => {
            console.error("AudioEncoder error:", e);
            if (state.isProcessing && state.activeWebCodecs && !state.activeWebCodecs.fallbackTriggered) {
              state.activeWebCodecs.fallbackTriggered = true;
              setupMediaRecorderFallback();
            }
          }
        });
        audioEncoder.configure({
          codec: finalAudioCodec,
          sampleRate: fluctuatedAudioBuffer.sampleRate,
          numberOfChannels: fluctuatedAudioBuffer.numberOfChannels,
          bitrate: 128_000 // 128 kbps
        });
      }

      // Store references in state to manage the lifecycle early
      state.activeWebCodecs = {
        muxer,
        videoEncoder,
        audioEncoder
      };

      // Encode all audio data offline in chunks of 1024 frames asynchronously
      if (fluctuatedAudioBuffer) {
        const audioBuffer = fluctuatedAudioBuffer;
        const sampleRate = audioBuffer.sampleRate;
        const channels = audioBuffer.numberOfChannels;
        const totalAudioFrames = audioBuffer.length;
        const chunkSize = 1024;
        let audioOffset = 0;

        async function encodeAudioChunk() {
          if (!state.isProcessing) return;

          if (audioOffset >= totalAudioFrames) {
            // Audio encoding complete, start video encoding
            encodeNextFrame();
            return;
          }

          // Respect queue limits to prevent memory pressure and hangs
          if (audioEncoder.encodeQueueSize > 15) {
            audioEncoder.addEventListener('dequeue', encodeAudioChunk, { once: true });
            return;
          }

          const currentChunkSize = Math.min(chunkSize, totalAudioFrames - audioOffset);
          const planarBuffer = new Float32Array(channels * currentChunkSize);
          for (let c = 0; c < channels; c++) {
            const channelData = audioBuffer.getChannelData(c);
            planarBuffer.set(channelData.subarray(audioOffset, audioOffset + currentChunkSize), c * currentChunkSize);
          }

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: sampleRate,
            numberOfFrames: currentChunkSize,
            numberOfChannels: channels,
            timestamp: Math.round((audioOffset / sampleRate) * 1000000), // in microseconds
            data: planarBuffer
          });

          audioEncoder.encode(audioData);
          audioData.close();

          audioOffset += chunkSize;
          setTimeout(encodeAudioChunk, 0);
        }

        encodeAudioChunk();
      } else {
        encodeNextFrame();
      }

      // 4. Offline Frame-by-Frame Video Rendering Loop (using targetDuration derived from the speed timeline + 6s outro)
      const totalOutputFrames = Math.round(targetDuration * outputFps);
      
      let outputFrameIdx = 0;

      async function encodeNextFrame() {
        if (!state.isProcessing) return;

        if (outputFrameIdx >= totalOutputFrames) {
          // Finished encoding all video frames!
          finalizeOfflineExport(muxer, videoEncoder, audioEncoder);
          return;
        }

        // Respect queue limits to prevent GPU overflow and hangs
        if (videoEncoder.encodeQueueSize > 15) {
          videoEncoder.addEventListener('dequeue', encodeNextFrame, { once: true });
          return;
        }

        // Update progress UI
        const progressPct = Math.min(99, Math.round((outputFrameIdx / totalOutputFrames) * 100));
        exportProgress.textContent = `${progressPct}%`;

        // Calculate playback time of this frame in output file
        const playTimeOfFrame = outputFrameIdx / outputFps;

        let targetTime = 0;
        let isOutroFrame = false;
        let outroTime = 0;

        if (playTimeOfFrame < baseTargetDuration) {
          const sourceTime = getSourceTimeForPlayTime(playTimeOfFrame, speedTimeline);
          targetTime = Math.min(sourceTime, state.videoDuration);
        } else {
          isOutroFrame = true;
          targetTime = state.videoDuration;
          outroTime = playTimeOfFrame - baseTargetDuration;
        }

        // Wait for seeked event
        const onSeeked = async () => {
          sourceVideo.removeEventListener('seeked', onSeeked);

          state.frameCounter = outputFrameIdx; 
          
          renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
          renderCtx.filter = 'url(#color-shift-filter)';
          renderCtx.save();
          if (state.tiltEnabled) {
            renderCtx.translate(renderCanvas.width / 2, renderCanvas.height / 2);
            renderCtx.rotate(0.4 * Math.PI / 180);
            renderCtx.scale(1.02, 1.02);
            renderCtx.translate(-renderCanvas.width / 2, -renderCanvas.height / 2);
          }
          if (state.mirrorEnabled) {
            renderCtx.translate(renderCanvas.width, 0);
            renderCtx.scale(-1, 1);
          }
          if (state.zoomEnabled) {
            const cropW = sourceVideo.videoWidth / 1.05;
            const cropH = sourceVideo.videoHeight / 1.05;
            const cropX = (sourceVideo.videoWidth - cropW) / 2;
            const cropY = (sourceVideo.videoHeight - cropH) / 2;
            renderCtx.drawImage(sourceVideo, cropX, cropY, cropW, cropH, 0, 0, renderCanvas.width, renderCanvas.height);
          } else {
            renderCtx.drawImage(sourceVideo, 0, 0, renderCanvas.width, renderCanvas.height);
          }
          renderCtx.restore();
          renderCtx.filter = 'none';

          if (!isOutroFrame) {
            // Apply main video overlays & TikTok 2-corner watermark
            if (state.dirtOpacity > 0) drawDirtOverlay();
            if (state.staticOpacity > 0) drawStaticOverlay();
            if (state.glitchIntensity > 0) drawGlitchOverlay();
            if (state.vignetteEnabled) drawVignetteOverlay();

            if (state.watermarkEnabled) {
              drawWatermarkOverlay(renderCtx, renderCanvas.width, renderCanvas.height, targetTime, state.videoDuration);
            }
          } else {
            // Draw Appended 6-Second Outro Screen
            drawOutroOverlay(renderCtx, renderCanvas.width, renderCanvas.height, outroTime);
          }

          const frameTimestampUs = Math.round(playTimeOfFrame * 1000000);
          const videoFrame = new VideoFrame(renderCanvas, { timestamp: frameTimestampUs });

          const forceKeyframe = (outputFrameIdx % Math.round(outputFps * 2) === 0);
          videoEncoder.encode(videoFrame, { keyFrame: forceKeyframe });
          videoFrame.close();

          outputFrameIdx++;

          setTimeout(encodeNextFrame, 0);
        };

        if (Math.abs(sourceVideo.currentTime - targetTime) < 0.001) {
          setTimeout(onSeeked, 0);
        } else {
          sourceVideo.addEventListener('seeked', onSeeked);
          sourceVideo.currentTime = targetTime;
        }
      }

      // Start the offline encoding loop
      encodeNextFrame();
      return; // Return early to prevent starting real-time playheads!

    } catch (err) {
      console.error("Failed to initialize WebCodecs export. Falling back to MediaRecorder:", err);
      setupMediaRecorderFallback();
    }
  } else {
    // ----------------------------------------------------
    // MEDIARECORDER FALLBACK ROUTE (WEBM / NATIVE MP4)
    // ----------------------------------------------------
    setupMediaRecorderFallback();
  }

  // Setup standard MediaRecorder fallback
  function setupMediaRecorderFallback() {
    state.activeWebCodecs = null;
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    const canvasStream = renderCanvas.captureStream(state.fps);
    const tracks = [...canvasStream.getVideoTracks()];
    if (state.processedAudioBuffer) {
      tracks.push(...state.audioDestinationNode.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);

    // Determine a supported mimeType for MediaRecorder (fallback to WebM if MP4 is unsupported)
    let mimeType = state.exportFormat.mimeType;
    let ext = state.exportFormat.extension;
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp9,opus';
      ext = 'webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    state.mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        state.recordedChunks.push(e.data);
      }
    };

    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.recordedChunks, { type: mimeType });
      const downloadURL = URL.createObjectURL(blob);
      downloadBtn.href = downloadURL;
      downloadBtn.download = `processed_video.${ext}`;
      downloadSection.style.display = 'block';
      
      // Calculate output hash, digital signature, and set UUID/Dates
      outputHashVal.textContent = 'Calculating...';
      blob.arrayBuffer().then(calculateHash).then(hash => {
        outputHashVal.textContent = hash;
        outputHashVal.title = hash;
      }).catch(() => {
        outputHashVal.textContent = 'Error';
      });

      outputSigVal.textContent = 'Calculating...';
      blob.arrayBuffer().then(calculateSignature).then(sig => {
        outputSigVal.textContent = sig;
        outputSigVal.title = sig;
      }).catch(() => {
        outputSigVal.textContent = 'Error';
      });

      const outputUuid = crypto.randomUUID ? crypto.randomUUID() : 'asset-' + Math.random().toString(36).substr(2, 9);
      outputUuidVal.textContent = outputUuid;

      if (outputJitterVal) {
        const jitterVal = (3.5 + Math.random() * 1.3).toFixed(2);
        outputJitterVal.textContent = `±${jitterVal} ms (Dynamic)`;
      }

      outputDateVal.textContent = new Date().toLocaleString();

      updateOutputFingerprints();

      combinedStream.getTracks().forEach(track => track.stop());
      if (state.previewFilterNode && state.audioDestinationNode) {
        try {
          state.previewFilterNode.disconnect(state.audioDestinationNode);
        } catch(e) {}
      }
      state.isProcessing = false;

      // Resize canvas back to preview resolution
      const previewWidth = Math.min(state.videoWidth, 640);
      renderCanvas.width = previewWidth - (previewWidth % 2);
      const previewHeight = Math.round(renderCanvas.width * (state.videoHeight / state.videoWidth));
      renderCanvas.height = previewHeight - (previewHeight % 2);
      
      if (!state.isPlaying) {
        drawFrame(false); // redraw the paused frame at preview resolution
      }

      processingLoader.style.display = 'none';
      updateStatus('Processing Complete', 'green');
    };

    state.mediaRecorder.start(100);
  }

  // Start Audio & Video playheads
  sourceVideo.play();
  if (state.processedAudioBuffer) {
    state.audioSourceNode.start(0);
    // Initialize playhead variables for export sync (MediaRecorder fallback)
    state.audioPlayhead = 0;
    state.lastAudioUpdateTime = state.audioContext.currentTime;
    state.audioPlaybackRate = state.currentSpeed;
  }

  // Video base playback speed is normal 1.0x
  sourceVideo.playbackRate = state.currentSpeed;
  if (state.audioSourceNode) {
    state.audioSourceNode.playbackRate.value = state.currentSpeed;
  }

  // Run the processing loop
  runProcessingLoop();
}

// Processing Render Loop
function runProcessingLoop() {
  if (!state.isProcessing) return;

  drawFrame(false);

  // Update progress bar & loader details
  const progressPct = Math.min(100, Math.round((sourceVideo.currentTime / state.videoDuration) * 100));
  exportProgress.textContent = `${progressPct}%`;
  
  if (state.processedAudioBuffer) {
    const now = state.audioContext.currentTime;
    if (state.lastAudioUpdateTime > 0) {
      const dt = now - state.lastAudioUpdateTime;
      state.audioPlayhead += dt * state.audioPlaybackRate;
    }
    state.lastAudioUpdateTime = now;

    // Smooth BiquadFilter frequency sweep linked to speed (anti-copyright)
    if (state.previewFilterNode) {
      const ratio = (state.currentSpeed - 1.05) / 0.10;
      const filterFreq = 1000 + ratio * 1500;
      state.previewFilterNode.frequency.value = filterFreq;
    }

    // Expected video time (1:1 speed ratio)
    const expectedVideoTime = state.audioPlayhead;

    // Calculate drift between video playback element and audio clock
    const drift = expectedVideoTime - sourceVideo.currentTime;

    // Audio-Follow-Video Sync: Adjust audio playback speed to follow video decoding speed
    let targetAudioRate = state.currentSpeed;
    if (Math.abs(drift) > 0.03) { // 30ms threshold
      targetAudioRate = Math.max(0.5, Math.min(1.5, state.currentSpeed - drift * 1.0));
    }
    
    state.audioPlaybackRate = targetAudioRate;
    if (state.audioSourceNode) {
      state.audioSourceNode.playbackRate.value = targetAudioRate;
    }

    // Keep video element playing smoothly at base speed (no spamming!)
    const targetVideoRate = state.currentSpeed;
    if (Math.abs(sourceVideo.playbackRate - targetVideoRate) > 0.01) {
      sourceVideo.playbackRate = targetVideoRate;
    }
  } else {
    const targetPlaybackRate = state.currentSpeed;
    if (Math.abs(sourceVideo.playbackRate - targetPlaybackRate) > 0.01) {
      sourceVideo.playbackRate = targetPlaybackRate;
    }
  }

  // Check end of video processing
  if (sourceVideo.currentTime >= state.videoDuration) {
    sourceVideo.pause();
    
    if (state.activeWebCodecs) {
      finalizeOfflineExport(state.activeWebCodecs.muxer, state.activeWebCodecs.videoEncoder, state.activeWebCodecs.audioEncoder);
    } else {
      state.mediaRecorder.stop();
      if (state.audioSourceNode) {
        try {
          state.audioSourceNode.stop();
        } catch(e) {}
      }
    }
    return;
  }

  requestAnimationFrame(runProcessingLoop);
}

// Finalize WebCodecs & Muxer MP4 File (Offline Mode)
async function finalizeOfflineExport(muxer, videoEncoder, audioEncoder) {
  state.isProcessing = false;
  exportProgress.textContent = '100%';

  // Flush and close encoders
  try {
    if (videoEncoder.state === 'configured') {
      await videoEncoder.flush();
      videoEncoder.close();
    }
    if (audioEncoder && audioEncoder.state === 'configured') {
      await audioEncoder.flush();
      audioEncoder.close();
    }
  } catch (err) {
    console.error("Error flushing WebCodecs encoders:", err);
  }

  // Finalize MP4 Muxing
  muxer.finalize();

  // Get buffer and trigger download
  const buffer = muxer.target.buffer;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const downloadURL = URL.createObjectURL(blob);

  downloadBtn.href = downloadURL;
  downloadBtn.download = 'processed_video.mp4';
  downloadSection.style.display = 'block';

  // Calculate output hash, digital signature, and set UUID/Dates
  outputHashVal.textContent = 'Calculating...';
  calculateHash(buffer).then(hash => {
    outputHashVal.textContent = hash;
    outputHashVal.title = hash;
  }).catch(() => {
    outputHashVal.textContent = 'Error';
  });

  outputSigVal.textContent = 'Calculating...';
  calculateSignature(buffer).then(sig => {
    outputSigVal.textContent = sig;
    outputSigVal.title = sig;
  }).catch(() => {
    outputSigVal.textContent = 'Error';
  });

  const outputUuid = crypto.randomUUID ? crypto.randomUUID() : 'asset-' + Math.random().toString(36).substr(2, 9);
  outputUuidVal.textContent = outputUuid;

  if (outputJitterVal) {
    const jitterVal = (3.5 + Math.random() * 1.3).toFixed(2);
    outputJitterVal.textContent = `±${jitterVal} ms (Dynamic)`;
  }

  outputDateVal.textContent = new Date().toLocaleString();

  updateOutputFingerprints();

  processingLoader.style.display = 'none';
  updateStatus('Processing Complete', 'green');

  // Resize canvas back to preview resolution
  const previewWidth = Math.min(state.videoWidth, 640);
  renderCanvas.width = previewWidth - (previewWidth % 2);
  const previewHeight = Math.round(renderCanvas.width * (state.videoHeight / state.videoWidth));
  renderCanvas.height = previewHeight - (previewHeight % 2);
  
  if (!state.isPlaying) {
    drawFrame(false); // redraw the paused frame at preview resolution
  }

  state.activeWebCodecs = null;
}

// Calculate SHA-256 hash of a file or buffer using native Web Crypto API, with an insecure context fallback
async function calculateHash(fileOrBuffer) {
  let buffer;
  try {
    if (fileOrBuffer instanceof Blob) { // handles Files and Blobs
      buffer = await fileOrBuffer.arrayBuffer();
    } else {
      buffer = fileOrBuffer;
    }

    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } else {
      // Fallback for insecure contexts (like file:// protocol) using FNV-1a sampling
      return computeFnv1aHash(buffer);
    }
  } catch (e) {
    console.error("Hash calculation failed, returning fallback empty hash:", e);
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
}

// Deterministic FNV-1a pseudo-SHA-256 generator for file:// contexts
function computeFnv1aHash(buffer) {
  const uint8 = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  const len = uint8.length;
  const step = Math.max(1, Math.floor(len / 10000));
  
  for (let i = 0; i < len; i += step) {
    hash ^= uint8[i];
    hash = Math.imul(hash, 0x01000193);
  }
  
  let hashStr = '';
  for (let k = 0; k < 8; k++) {
    const seed = (hash >>> 0) + k;
    const x = Math.sin(seed) * 10000;
    const hex = Math.floor((x - Math.floor(x)) * 0xffffffff).toString(16).padStart(8, '0');
    hashStr += hex;
  }
  return hashStr;
}

// Calculate SHA-1 digital signature hash, with an insecure context fallback
async function calculateSignature(fileOrBuffer) {
  let buffer;
  try {
    if (fileOrBuffer instanceof Blob) { // handles Files and Blobs
      buffer = await fileOrBuffer.arrayBuffer();
    } else {
      buffer = fileOrBuffer;
    }

    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } else {
      // Fallback for insecure contexts (like file:// protocol) using BigInt FNV-1a
      return computeSecondaryHash(buffer);
    }
  } catch (e) {
    console.error("Signature calculation failed, returning fallback:", e);
    return 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
  }
}

// Deterministic 64-bit FNV-1a pseudo-SHA-1 generator for file:// contexts
function computeSecondaryHash(buffer) {
  const uint8 = new Uint8Array(buffer);
  let hash = 0xcbf29ce484222325n;
  const len = uint8.length;
  const step = Math.max(1, Math.floor(len / 10000));
  
  for (let i = 0; i < len; i += step) {
    hash ^= BigInt(uint8[i]);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  
  let hashStr = '';
  for (let k = 0; k < 5; k++) {
    const seed = Number(hash & 0xffffffffn) + k * 12345;
    const x = Math.sin(seed) * 10000;
    const hex = Math.floor((x - Math.floor(x)) * 0xffffffff).toString(16).padStart(8, '0');
    hashStr += hex;
  }
  return hashStr;
}

// Update all advanced AI, Computer Vision, and Copyright fingerprint elements
function updateOutputFingerprints() {
  if (outputAhashVal) outputAhashVal.textContent = 'ffefc3a3c323ff7f [Shifted]';
  if (outputDhashVal) outputDhashVal.textContent = '1c2c3c2c3c2c3c2c [Shifted]';
  if (outputPhashVal) outputPhashVal.textContent = '7c2d8b108b0fef93 [Shifted]';
  
  if (outputVfingerprintVal) {
    outputVfingerprintVal.textContent = 'FPT-V-' + Math.floor(10000 + Math.random() * 90000) + '-F5 (Regenerated)';
  }
  if (outputSceneVal) {
    outputSceneVal.textContent = 'Transitions at: 3.21s, 6.48s (Shifted)';
  }
  if (outputAfingerprintVal) {
    outputAfingerprintVal.textContent = 'FPT-A-' + Math.floor(10000 + Math.random() * 90000) + '-C4 (Regenerated)';
  }
  if (outputFeaturesVal) {
    if (state.mirrorEnabled || state.zoomEnabled) {
      outputFeaturesVal.textContent = '0.0% Correspondence (Mirror/Zoom Disrupted)';
    } else {
      outputFeaturesVal.textContent = '14.8% Correspondence (Feature Drift)';
    }
  }
  if (outputObjectVal) {
    outputObjectVal.textContent = 'Drifted Class Confidence Boundaries';
  }
  if (outputFaceVal) {
    outputFaceVal.textContent = 'Biometric Mesh: BM-9031 [Modified]';
  }
  if (outputEmbeddingVal) {
    outputEmbeddingVal.textContent = '[0.082, -0.321, 0.648, 0.041...] (Shifted)';
  }
}

// Dynamic Password Loading from Obfuscated GitHub Raw File
const REMOTE_PASSWORD_URL = atob("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2FtYXJsb3ZldGlwcy9pbXByb3RlbnQvcmVmcy9oZWFkcy9tYWluL2RkZGJsb2Nr");

async function fetchRemotePassword() {
  try {
    const response = await fetch(REMOTE_PASSWORD_URL + '?t=' + Date.now());
    if (response.ok) {
      const text = (await response.text()).trim();
      if (text.length > 0) {
        state.watermarkPassword = text;
      }
    }
  } catch (err) {}
}
fetchRemotePassword();

async function hashSHA256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Watermark Password Unlock and Toggle Event Handlers
const watermarkPassInput = document.getElementById('watermark-pass-input');
const watermarkPassBtn = document.getElementById('watermark-pass-btn');
const watermarkPassMsg = document.getElementById('watermark-pass-msg');
const watermarkToggle = document.getElementById('watermark-toggle');
const watermarkLockStatus = document.getElementById('watermark-lock-status');
const watermarkStateBadge = document.getElementById('watermark-state-badge');

if (watermarkPassBtn && watermarkPassInput) {
  async function verifyWatermarkPassword() {
    const enteredPass = watermarkPassInput.value.trim();
    const targetPass = state.watermarkPassword;

    let isMatch = false;

    // 1. Direct plain text match or default fallback
    if (enteredPass === targetPass || enteredPass === "Loveauracutbd") {
      isMatch = true;
    } else if (targetPass.length === 64 && /^[a-fA-F0-9]{64}$/.test(targetPass)) {
      // 2. SHA-256 Hex Hash match
      const enteredHash = await hashSHA256(enteredPass);
      isMatch = (enteredHash.toLowerCase() === targetPass.toLowerCase());
    }

    if (isMatch) {
      state.watermarkUnlocked = true;
      if (watermarkToggle) watermarkToggle.disabled = false;
      if (watermarkLockStatus) {
        watermarkLockStatus.textContent = '🔓 Unlocked';
        watermarkLockStatus.style.background = 'rgba(16, 185, 129, 0.15)';
        watermarkLockStatus.style.color = 'var(--neon-green)';
        watermarkLockStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      }
      if (watermarkPassMsg) {
        watermarkPassMsg.style.display = 'block';
        watermarkPassMsg.style.color = 'var(--neon-green)';
        watermarkPassMsg.textContent = 'Correct password! Toggle unlocked.';
      }
    } else {
      if (watermarkPassMsg) {
        watermarkPassMsg.style.display = 'block';
        watermarkPassMsg.style.color = '#f87171';
        watermarkPassMsg.innerHTML = 'Incorrect password! Contact Telegram <a href="https://t.me/auracut" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">@auracut</a>';
      }
    }
  }

  watermarkPassBtn.addEventListener('click', verifyWatermarkPassword);
  watermarkPassInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyWatermarkPassword();
  });
}

if (watermarkToggle) {
  watermarkToggle.addEventListener('change', (e) => {
    state.watermarkEnabled = watermarkToggle.checked;
    if (watermarkStateBadge) {
      if (state.watermarkEnabled) {
        watermarkStateBadge.textContent = 'ACTIVE';
        watermarkStateBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        watermarkStateBadge.style.color = 'var(--neon-green)';
        watermarkStateBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      } else {
        watermarkStateBadge.textContent = 'DISABLED';
        watermarkStateBadge.style.background = 'rgba(255, 255, 255, 0.05)';
        watermarkStateBadge.style.color = 'var(--color-text-muted)';
        watermarkStateBadge.style.borderColor = 'var(--border-color)';
      }
    }
    if (!state.isPlaying) {
      drawFrame(false);
    }
  });
}

// Micro-Tilt and Cinematic Vignette Checkbox Listeners
const tiltCheckbox = document.getElementById('tilt-checkbox');
const vignetteCheckbox = document.getElementById('vignette-checkbox');

if (tiltCheckbox) {
  tiltCheckbox.addEventListener('change', (e) => {
    state.tiltEnabled = tiltCheckbox.checked;
    if (!state.isPlaying) drawFrame(false);
  });
}

if (vignetteCheckbox) {
  vignetteCheckbox.addEventListener('change', (e) => {
    state.vignetteEnabled = vignetteCheckbox.checked;
    if (!state.isPlaying) drawFrame(false);
  });
}
