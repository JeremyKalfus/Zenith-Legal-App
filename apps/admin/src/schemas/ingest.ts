import { z } from 'zod';

export const bulkPasteSchema = z.object({
  lines: z.string().min(1, 'Paste at least one firm row'),
});

export type BulkPasteInput = z.infer<typeof bulkPasteSchema>;

export function parseFirmLines(raw: string): Array<{ name: string }> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}
