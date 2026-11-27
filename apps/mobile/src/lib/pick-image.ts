import * as ImagePicker from 'expo-image-picker';

import type { UploadFile } from '@/lib/api';
import { toUploadBlob } from '@/lib/upload-file';

/** The API takes JPG, PNG, WebP or HEIC up to 8MB. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export class ImageTooBigError extends Error {
  constructor() {
    super('That photo is over 8MB. Try a smaller one.');
  }
}

/** A photo from the library, ready to upload, or null if they cancelled. */
export async function pickImage(options: { square?: boolean } = {}): Promise<UploadFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: !!options.square,
    aspect: options.square ? [1, 1] : undefined,
    quality: 0.85,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) throw new ImageTooBigError();
  return toUploadBlob({ uri: asset.uri, name: asset.fileName ?? 'photo.jpg', file: asset.file });
}
