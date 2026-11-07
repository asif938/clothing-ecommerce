import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  locale: z.string().default("bn"),
});
export type PushSubscribeDto = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url() });
export type PushUnsubscribeDto = z.infer<typeof pushUnsubscribeSchema>;

export const sendTestPushSchema = z.object({ customerId: z.string().min(1), title: z.string().min(1).max(100), body: z.string().min(1).max(300) });
export type SendTestPushDto = z.infer<typeof sendTestPushSchema>;
