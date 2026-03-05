import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export function sanitizeFilename(name) {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const parsed = path.parse(normalized);
  const ext = parsed.ext.toLowerCase();
  const base = parsed.name.toLowerCase();
  const safeBase = base
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 100) || 'datei';
  const safeExt = ext.replace(/[^a-z0-9.]/g, '').slice(0, 15);
  return `${safeBase}${safeExt}`;
}

export function sanitizeCategory(input) {
  if (!input) {
    return '';
  }
  return input
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function findAvailableFilePath(directory, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  for (let counter = 0; counter <= 10_000; counter += 1) {
    const suffix = counter === 0 ? '' : `_${counter}`;
    const candidate = path.join(directory, `${base}${suffix}${ext}`);

    try {
      await access(candidate, constants.F_OK);
    } catch {
      return candidate;
    }
  }

  throw new Error('Could not find available filename.');
}
