import { generateBarcodeValue, generateBarcodeBase64 } from '../modules/barcodes/barcode.util';

describe('Barcode utilities', () => {
  describe('generateBarcodeValue', () => {
    it('should generate a barcode string', () => {
      const val = generateBarcodeValue('ELEC-001');
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });

    it('should use SKU prefix in barcode', () => {
      const val = generateBarcodeValue('STAT-XYZ');
      expect(val.startsWith('STAT')).toBe(true);
    });

    it('should produce different values over time', async () => {
      const val1 = generateBarcodeValue('SKU1');
      await new Promise((r) => setTimeout(r, 5));
      const val2 = generateBarcodeValue('SKU2');
      // Different SKUs mean different barcodes
      expect(val1).not.toBe(val2);
    });

    it('should strip non-alphanumeric characters from SKU', () => {
      const val = generateBarcodeValue('EL!@#EC-001');
      // Should only have alphanumeric prefix
      expect(/^[A-Z0-9]/.test(val)).toBe(true);
    });

    it('should pad short SKUs to 4 chars', () => {
      const val = generateBarcodeValue('AB');
      expect(val.startsWith('AB00')).toBe(true);
    });
  });

  describe('generateBarcodeBase64', () => {
    it('should return a base64 data URI', async () => {
      const result = await generateBarcodeBase64('TEST123');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('should generate non-empty image data', async () => {
      const result = await generateBarcodeBase64('ELEC-001');
      const base64Part = result.replace('data:image/png;base64,', '');
      expect(base64Part.length).toBeGreaterThan(100);
    });
  });
});
