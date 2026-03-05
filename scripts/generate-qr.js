import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

const url = process.argv[2] || 'http://drop.local';
const output = process.argv[3] || 'qr-dropzone.png';

await fs.mkdir(path.dirname(output), { recursive: true });
await QRCode.toFile(output, url, {
  type: 'png',
  margin: 1,
  errorCorrectionLevel: 'M',
  color: {
    dark: '#0f172a',
    light: '#ffffff'
  }
});

console.log(`QR code generated: ${output} -> ${url}`);
