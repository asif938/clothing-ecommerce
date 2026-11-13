import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Conversation } from "@clothing/db";
import { t } from "@clothing/shared";
import { ASSISTANT_MAX_TOOL_ROUNDS, ASSISTANT_TOOLS, detectLanguage } from "@clothing/shared/support";
import type { AiChatMessage, AiToolCall } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AiService } from "../ai/ai.service";
import { InboxService } from "./inbox.service";
import { AssistantToolsService } from "./assistant-tools.service";

/** How much history the assistant sees. */
const HISTORY = 16;
/** A pending inbound older than this was missed by the inline trigger (restart, crash) — the sweep picks it up. */
const STALE_PENDING_MS = 30_000;
/** Assistant replies are capped so a model that rambles can't flood a chat. */
const MAX_REPLY_CHARS = 1500;

export interface AssistantRunResult {
  outcome: "replied" | "handoff" | "skipped";
  reply?: string;
  reason?: string;
}

/**
 * AI chat assistant (docs/PROJECT_SPEC.md §10.4, §16 M15): answers product,
 * size, stock and order questions through tools, and hands the
 * conversation to staff when asked, when it's unsure, or when AI is
 * unavailable. Runs right after an inbound message is stored (inline,
 * fire-and-forget so the webhook answers fast) and from a sweep for
 * anything the inline run missed. One run per conversation at a time.
 */
@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly logger = new Logger(AssistantService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly ai: AiService,
    private readonly inbox: InboxService,
    private readonly tools: AssistantToolsService,
  ) {}

  onModuleInit(): void {
    this.inbox.registerBotTrigger((conversationId) => {
      void this.respond(conversationId).catch((error: unknown) => this.logger.warn(`Assistant run failed: ${error instanceof Error ? error.message : "Unknown error"}`));
    });
  }

  async sweep(now = new Date()): Promise<number> {
    const stale = await this.prisma.conversation.findMany({ where: { botActive: true, botPendingSince: { lt: new Date(now.getTime() - STALE_PENDING_MS) } }, select: { id: true }, take: 10 });
    for (const row of stale) await this.respond(row.id);
    return stale.length;
  }

  private async transcript(conversationId: string): Promise<{ messages: AiChatMessage[]; lastCustomerText: string }> {
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId, direction: { not: "internal" }, authorType: { in: ["customer", "bot", "staff"] } },
      orderBy: { createdAt: "desc" },
      take: HISTORY,
    });
    rows.reverse();
    const messages: AiChatMessage[] = [];
    for (const row of rows) {
      const body = row.body.trim() || (row.attachments ? "[attachment]" : "");
      if (!body) continue;
      if (row.authorType === "customer") messages.push({ role: "user", text: body });
      else messages.push({ role: "assistant", text: body });
    }
    // Providers expect the transcript to start with the customer.
    while (messages[0] && messages[0].role !== "user") messages.shift();
    const lastCustomer = [...rows].reverse().find((r) => r.authorType === "customer");
    return { messages, lastCustomerText: lastCustomer?.body ?? "" };
  }

  async respond(conversationId: string): Promise<AssistantRunResult> {
    if (this.running.has(conversationId)) return { outcome: "skipped", reason: "already running" };
    this.running.add(conversationId);
    try {
      const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation || !conversation.botActive) return { outcome: "skipped", reason: "assistant not active" };
      // Claim the pending message; a staff reply in the meantime clears botActive and wins.
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { botPendingSince: null } });
      return await this.run(conversation);
    } finally {
      this.running.delete(conversationId);
    }
  }

  private async run(conversation: Conversation): Promise<AssistantRunResult> {
    const { messages, lastCustomerText } = await this.transcript(conversation.id);
    if (messages.length === 0) return { outcome: "skipped", reason: "nothing to answer" };
    const locale: "bn" | "en" = detectLanguage(lastCustomerText) === "Bangla" ? "bn" : "en";
    const [hours, phone] = await Promise.all([this.settings.getValue<{ bn?: string; en?: string }>("support.hours"), this.settings.getValue<string | null>("brand.phone").catch(() => null)]);
    const customerPhone = conversation.contactPhone ?? (conversation.customerId ? ((await this.prisma.customer.findUnique({ where: { id: conversation.customerId }, select: { phone: true } }))?.phone ?? null) : null);
    const trace: { tool: string; input: unknown; isError: boolean }[] = [];

    for (let round = 0; round <= ASSISTANT_MAX_TOOL_ROUNDS; round++) {
      let turn;
      try {
        turn = await this.ai.chat({
          feature: "chat_assistant",
          variables: { channel: conversation.channel.replace("_", " "), support_hours: t(hours, locale), support_phone: typeof phone === "string" ? phone : "" },
          messages,
          // On the last round, no more tools: the model must answer with what it has.
          tools: round < ASSISTANT_MAX_TOOL_ROUNDS ? ASSISTANT_TOOLS : ASSISTANT_TOOLS.filter((tool) => tool.name === "handoff_to_human"),
          actor: null,
          entity: { type: "conversation", id: conversation.id },
        });
      } catch (error) {
        // AI off, over budget or every provider failing: a person takes over rather than the customer waiting on a bot.
        return await this.handoff(conversation, `Assistant unavailable: ${error instanceof Error ? error.message.slice(0, 200) : "error"}`, locale, trace);
      }

      const handoffCall = turn.toolCalls.find((call) => call.name === "handoff_to_human");
      if (handoffCall) {
        const reason = typeof handoffCall.input.reason === "string" ? handoffCall.input.reason.slice(0, 300) : "Assistant handed over";
        return await this.handoff(conversation, reason, locale, trace, turn.text);
      }

      if (turn.toolCalls.length === 0) {
        const reply = turn.text.trim().slice(0, MAX_REPLY_CHARS);
        if (!reply) return await this.handoff(conversation, "Assistant had no answer", locale, trace);
        if (!(await this.stillActive(conversation.id))) return { outcome: "skipped", reason: "staff took over" };
        await this.inbox.sendOutbound(conversation, reply, { type: "bot", toolTrace: trace.length ? trace : undefined });
        return { outcome: "replied", reply };
      }

      messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });
      messages.push({ role: "tool", results: await this.runTools(turn.toolCalls, customerPhone, conversation.customerId, trace) });
    }
    return await this.handoff(conversation, "Assistant used every tool round without an answer", locale, trace);
  }

  private async runTools(calls: AiToolCall[], trustedPhone: string | null, customerId: string | null, trace: { tool: string; input: unknown; isError: boolean }[]) {
    const results = [];
    for (const call of calls) {
      const outcome = await this.tools.run(call.name, call.input, { trustedPhone, customerId });
      trace.push({ tool: call.name, input: call.input, isError: outcome.isError });
      results.push({ toolCallId: call.id, name: call.name, content: outcome.content, isError: outcome.isError });
    }
    return results;
  }

  private async stillActive(conversationId: string): Promise<boolean> {
    const fresh = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { botActive: true } });
    return fresh?.botActive === true;
  }

  private async handoff(conversation: Conversation, reason: string, locale: "bn" | "en", trace: unknown[], modelText?: string): Promise<AssistantRunResult> {
    if (!(await this.stillActive(conversation.id))) return { outcome: "skipped", reason: "staff took over" };
    const updated = await this.prisma.conversation.update({ where: { id: conversation.id }, data: { botActive: false, botPendingSince: null, status: "waiting_agent", handoffReason: reason } });
    const message = (modelText?.trim() || t(await this.settings.getValue<{ bn?: string; en?: string }>("support.assistant.handoffMessage"), locale)).slice(0, MAX_REPLY_CHARS);
    try {
      await this.inbox.sendOutbound(updated, message, { type: "bot", toolTrace: trace.length ? trace : undefined });
    } catch (error) {
      this.logger.warn(`Handoff message not sent for ${conversation.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    await this.inbox.notifyHandoff(updated, reason);
    return { outcome: "handoff", reason };
  }
}
