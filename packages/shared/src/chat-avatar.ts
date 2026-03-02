export function hasChatAvatarImage(image: unknown): image is string {
  return typeof image === 'string' && image.trim().length > 0;
}
