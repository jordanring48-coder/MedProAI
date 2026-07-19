const sharp = require("sharp");
const path = require("path");

const SOURCE = "/home/team/shared/8.20.png";
const DEST = path.join(__dirname, "..", "public", "luna-header-light.png");
const TARGET_W = 1200;
const TARGET_H = 250;

async function main() {
  const src = sharp(SOURCE);
  const { width, height } = await src.metadata();
  console.log(`Source: ${width}x${height}`);

  // Get raw RGBA pixels
  const { data, info } = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let blackRemoved = 0;
  let kept = 0;

  // First pass: swap black background to white, keeping purple text.
  // This recalculates anti-alias blending for a white background.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Black background (R<30, G<30, B<30) → white
    if (r < 30 && g < 30 && b < 30) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      blackRemoved++;
      continue;
    }

    // Keep purple text pixels as-is
    kept++;
  }

  console.log(`Black→white: ${blackRemoved}`);
  console.log(`Purple text kept: ${kept}`);

  // Now create image from raw pixels, then remove white background
  const withWhiteBg = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  // Remove white background (R>240, G>240, B>240 → transparent)
  // This preserves the anti-aliased edges that were blended with white
  const { data: data2, info: info2 } = await sharp(withWhiteBg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let whiteRemoved = 0;
  let finalKept = 0;
  
  for (let i = 0; i < data2.length; i += 4) {
    const r = data2[i];
    const g = data2[i + 1];
    const b = data2[i + 2];

    // White background → transparent
    if (r > 240 && g > 240 && b > 240) {
      data2[i + 3] = 0;
      whiteRemoved++;
    } else {
      finalKept++;
    }
  }

  console.log(`White→transparent: ${whiteRemoved}`);
  console.log(`Final kept: ${finalKept}`);

  // Resize to target with transparent background
  await sharp(data2, {
    raw: { width: info2.width, height: info2.height, channels: 4 },
  })
    .resize(TARGET_W, TARGET_H, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(DEST);

  console.log(`Saved: ${DEST}`);
  
  // Verify
  const meta = await sharp(DEST).metadata();
  console.log(`Output: ${meta.width}x${meta.height}, format=${meta.format}, channels=${meta.channels}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
