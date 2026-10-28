// Cheap "does this look like an ultrasound?" check, run on the phone before an image is attached.
// Ultrasound frames are greyscale on a dark background. A selfie or colour photo fails both tests.
// This is a warning, not a block: a colour photo of a paper scan report is still allowed after a confirm.
// It cannot tell a black-and-white photo of something else from a scan.

const SIZE = 64; // downscale: enough to judge colour and darkness, fast on any phone

export async function looksLikeUltrasound(dataUrl: string): Promise<boolean> {
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = dataUrl;
    });
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext("2d");
    if (!ctx) return true; // can't check: don't get in the CHW's way
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let colourful = 0,
      dark = 0;
    const n = px.length / 4;
    for (let k = 0; k < px.length; k += 4) {
      const r = px[k],
        g = px[k + 1],
        b = px[k + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colourful++; // clearly tinted pixel
      if (0.299 * r + 0.587 * g + 0.114 * b < 50) dark++;
    }
    // small coloured overlays (Doppler, labels) are fine; a mostly coloured or bright picture is not
    return colourful / n < 0.1 && dark / n > 0.25;
  } catch {
    return true;
  }
}
