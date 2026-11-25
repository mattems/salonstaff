import { File } from 'expo-file-system';

/** A local file picked with expo-image-picker / expo-document-picker. */
export type LocalAsset = {
  uri: string;
  name?: string | null;
  /** Present on web: the browser File object. */
  file?: Blob;
};

/**
 * Turns a picked file into a Blob for multipart FormData. SDK 58's `expo/fetch` doesn't accept
 * React Native's `{ uri, name, type }` parts, so natively we use expo-file-system's `File`
 * (a Blob whose MIME type comes from the file extension).
 */
export function toUploadBlob(asset: LocalAsset): { blob: Blob; name: string } {
  const file = new File(asset.uri);
  return { blob: file, name: asset.name || file.name || 'upload' };
}
