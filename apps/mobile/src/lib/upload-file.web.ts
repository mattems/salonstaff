import type { LocalAsset } from './upload-file';

export type { LocalAsset };

/** Web preview: pickers return a browser `File`, which is already a Blob. */
export function toUploadBlob(asset: LocalAsset): { blob: Blob; name: string } {
  if (!asset.file) throw new Error('This file can’t be uploaded from the browser preview.');
  const name = asset.name || ('name' in asset.file ? String(asset.file.name) : '') || 'upload';
  return { blob: asset.file, name };
}
