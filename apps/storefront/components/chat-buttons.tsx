import { LiveChatWidget } from "./live-chat-widget";

interface ChatButtonsProps {
  /** §16 M15 — the on-site live chat (lands in the support inbox). */
  liveChatEnabled?: boolean;
  locale?: string;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  messengerEnabled: boolean;
  messengerPageUrl: string | null;
}

/** Floating click-to-chat buttons (docs/PROJECT_SPEC.md §7.2) — `click_to_chat` only; the Cloud API driver is for transactional notifications, not this button. */
export function ChatButtons({ liveChatEnabled = false, locale = "bn", whatsappEnabled, whatsappNumber, messengerEnabled, messengerPageUrl }: ChatButtonsProps) {
  if (!liveChatEnabled && (!whatsappEnabled || !whatsappNumber) && (!messengerEnabled || !messengerPageUrl)) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
      {liveChatEnabled && <LiveChatWidget locale={locale} />}
      {whatsappEnabled && whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-white shadow-lg"
          aria-label="WhatsApp"
        >
          WA
        </a>
      )}
      {messengerEnabled && messengerPageUrl && (
        <a href={messengerPageUrl} target="_blank" rel="noreferrer" className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg" aria-label="Messenger">
          FB
        </a>
      )}
    </div>
  );
}
