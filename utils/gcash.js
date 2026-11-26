import path from "node:path";
import { stat } from "node:fs/promises";

export async function getConfiguredGcashQr(settings) {
  const filenames = [...new Set([settings.gcash_qr_image, process.env.GCASH_QR_IMAGE, "servesync-gcash.png"].filter(Boolean))];
  for (const filename of filenames) {
    if (!/^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) continue;
    try {
      const file = await stat(path.resolve("storage/payment-assets", filename));
      if (file.isFile()) return filename;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return "";
}
