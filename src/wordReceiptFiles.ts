import { z } from 'zod';

export const receiptFileSchema = z.object({
  filename: z.string().min(1),
  role: z.enum(['student', 'key']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ReceiptFile = z.infer<typeof receiptFileSchema>;

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
