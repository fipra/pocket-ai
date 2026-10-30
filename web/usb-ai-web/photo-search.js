export const PHOTO_LIMIT = 20;
export const PHOTO_BYTES_LIMIT = 20_000_000;
export function validPhotoFiles(files) {
  return files.length > 0 && files.length <= PHOTO_LIMIT && files.every(file =>
    (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      (!file.type && /\.(?:jpe?g|png|webp)$/i.test(file.name || ''))) &&
    file.size > 0 && file.size <= PHOTO_BYTES_LIMIT);
}
