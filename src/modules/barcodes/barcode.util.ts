import bwipjs from 'bwip-js';

/**
 * Generate a Code128 barcode as a PNG buffer.
 * @param text  The barcode value (SKU, EAN, etc.)
 */
export async function generateBarcodeBuffer(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });
}

/**
 * Generate a barcode as a base64-encoded PNG string (data URI ready).
 */
export async function generateBarcodeBase64(text: string): Promise<string> {
  const buffer = await generateBarcodeBuffer(text);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * Auto-generate a unique barcode string based on SKU + timestamp.
 * Uses EAN-13 style numeric string (13 digits).
 * In a real system you'd use a GS1-compliant generator.
 */
export function generateBarcodeValue(sku: string): string {
  const now = Date.now().toString().slice(-8);
  const prefix = sku
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, '0');
  // Returns a 12-char alphanumeric barcode (Code128 compatible)
  return `${prefix}${now}`;
}
