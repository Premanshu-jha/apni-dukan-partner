/** Photos are shrunk on the phone before upload: a 12 MP camera photo is 4–8 MB, and the backend takes 10 MB. */
export const MAX_SIDE = 1600

/** The size to draw an image at so its longer side is at most MAX_SIDE (never enlarged). */
export function fitInside(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * A JPEG of the picked photo at most MAX_SIDE on its longer side. The browser applies the photo's EXIF rotation
 * when decoding, so the result is the right way up. Falls back to the original file if the browser can't decode it.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const size = fitInside(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}
