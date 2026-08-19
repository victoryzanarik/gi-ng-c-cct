import * as lamejsLib from 'lamejs';

const lamejs = (lamejsLib as any).default || lamejsLib;

export const SAMPLE_RATE = 24000;

export function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  const int16View = new Int16Array(buffer);
  const float32 = new Float32Array(int16View.length);
  for (let i = 0; i < int16View.length; i++) {
    float32[i] = int16View[i] / 32768.0;
  }
  return float32;
}

export function float32ArrayToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const buffer = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

export function encodeToMP3(float32Array: Float32Array): Blob {
  const mp3encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, 128); // mono, 24kHz, 128kbps
  const samples = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const sampleBlockSize = 1152;
  const mp3Data = [];
  for (let i = 0; i < samples.length; i += sampleBlockSize) {
    const sampleChunk = samples.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

export function downloadMp3(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

export function trimAudio(base64: string, startTime: number, endTime: number): string {
  const float32 = base64ToFloat32Array(base64);
  const startSample = Math.floor(startTime * SAMPLE_RATE);
  const endSample = Math.floor(endTime * SAMPLE_RATE);
  const trimmed = float32.slice(startSample, endSample);
  return float32ArrayToBase64(trimmed);
}

export function getAudioDuration(base64: string): number {
  const float32 = base64ToFloat32Array(base64);
  return float32.length / SAMPLE_RATE;
}

export async function processAudio(
  base64: string,
  options: { speed?: number; volume?: number; startTime?: number; endTime?: number }
): Promise<string> {
  const { speed = 1, volume = 1, startTime = 0 } = options;
  let float32 = base64ToFloat32Array(base64);
  const duration = float32.length / SAMPLE_RATE;
  const endTime = options.endTime ?? duration;

  // Trim
  const startSample = Math.floor(startTime * SAMPLE_RATE);
  const endSample = Math.floor(endTime * SAMPLE_RATE);
  const trimmedFloat32 = float32.subarray(startSample, endSample);

  // If no speed/volume changes, return directly
  if (speed === 1 && volume === 1) {
    return float32ArrayToBase64(trimmedFloat32);
  }

  // Use OfflineAudioContext for DSP
  const OfflineAudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const targetLength = Math.ceil(trimmedFloat32.length / speed);
  const ctx = new OfflineAudioCtx(1, targetLength, 24000);
  
  const buffer = ctx.createBuffer(1, trimmedFloat32.length, 24000);
  buffer.getChannelData(0).set(trimmedFloat32);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = speed;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);

  const renderedBuffer = await ctx.startRendering();
  return float32ArrayToBase64(renderedBuffer.getChannelData(0));
}

export function mergeAudioFiles(base64List: string[]): string {
  if (base64List.length === 0) return "";
  if (base64List.length === 1) return base64List[0];

  const arrays = base64List.map(base64ToFloat32Array);
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const merged = new Float32Array(totalLength);
  
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }
  return float32ArrayToBase64(merged);
}
