const byExt: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  heic: 'image/heic',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

function ext(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  const clean = input.split('?')[0];
  const idx = clean.lastIndexOf('.');
  if (idx < 0) {
    return null;
  }

  return clean.slice(idx + 1).toLowerCase();
}

const mime = {
  getType(input?: string | null): string | null {
    const e = ext(input);
    return e ? byExt[e] ?? null : null;
  },
  getExtension(type?: string | null): string | null {
    if (!type) {
      return null;
    }

    const target = type.toLowerCase();
    const match = Object.entries(byExt).find(([, value]) => value === target);
    return match ? match[0] : null;
  },
};

export default mime;
export const getType = mime.getType;
export const getExtension = mime.getExtension;
