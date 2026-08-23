/**
 * Average colour of a cover image, used to tint the player background.
 * Returns null when the image cannot be read (data URLs and blobs are fine).
 */
export async function dominantColor(src: string): Promise<string | null> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  try {
    await image.decode();
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
    count += 1;
  }
  if (count === 0) return null;

  // Push the average towards a saturated tone so dark artwork still tints.
  const boost = (value: number) => Math.min(255, Math.round((value / count) * 1.15));
  return `rgb(${boost(red)}, ${boost(green)}, ${boost(blue)})`;
}
