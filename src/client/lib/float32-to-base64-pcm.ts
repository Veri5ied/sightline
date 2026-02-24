export const float32ToBase64Pcm = (input: Float32Array): string => {
  const pcm = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, input[index]));
    pcm[index] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
};
