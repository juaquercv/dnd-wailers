/** Minimal 16-bit PCM mono WAV encoder. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  samples: number;
  durationSec: number;
}

/** Parses the header of a canonical PCM WAV (used to validate generated files). */
export function readWavInfo(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  if (buf.toString('ascii', 12, 16) !== 'fmt ' || buf.toString('ascii', 36, 40) !== 'data') return null;
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataBytes = buf.readUInt32LE(40);
  if (dataBytes + 44 !== buf.length || channels < 1 || bitsPerSample !== 16) return null;
  const samples = dataBytes / (channels * 2);
  return { sampleRate, channels, bitsPerSample, samples, durationSec: samples / sampleRate };
}
