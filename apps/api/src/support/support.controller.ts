import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseGuards, type RawBodyRequest } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { InboxService } from "./inbox.service";
import { TicketsService } from "./tickets.service";
import { CannedRepliesService } from "./canned-replies.service";
import { TelephonyService } from "./telephony.service";
import { InboxWebhooksService } from "./inbox-webhooks.service";
import { ChannelsService } from "./channels.service";
import {
  assignSchema,
  botSchema,
  callOutcomeSchema,
  cannedReplySchema,
  conversationStatusSchema,
  createTicketSchema,
  linkOrderSchema,
  listCallsQuerySchema,
  listConversationsQuerySchema,
  listTicketsQuerySchema,
  liveChatHandoffSchema,
  liveChatQuerySchema,
  liveChatSendSchema,
  messageBodySchema,
  myPhoneSchema,
  renderCannedSchema,
  simulateInboundSchema,
  startCallSchema,
  ticketMessageSchema,
  updateTicketSchema,
  type AssignDto,
  type BotDto,
  type CallOutcomeDto,
  type CannedReplyDto,
  type ConversationStatusDto,
  type CreateTicketDto,
  type LinkOrderDto,
  type ListCallsQueryDto,
  type ListConversationsQueryDto,
  type ListTicketsQueryDto,
  type LiveChatHandoffDto,
  type LiveChatQueryDto,
  type LiveChatSendDto,
  type MessageBodyDto,
  type MyPhoneDto,
  type RenderCannedDto,
  type SimulateInboundDto,
  type StartCallDto,
  type TicketMessageDto,
  type UpdateTicketDto,
} from "./dto";

/** Unified inbox (§8.2 Support, §16 M15). Everything needs `support.inbox`; assigning to someone else needs `support.manage`. */
@ApiTags("support")
@Controller("admin/support/conversations")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("support.inbox")
export class ConversationsController {
  constructor(
    private readonly inbox: InboxService,
    private readonly channels: ChannelsService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listConversationsQuerySchema)) query: ListConversationsQueryDto, @Req() req: Request) {
    return this.inbox.list(query, req.staff!);
  }

  @Get("summary")
  summary(@Req() req: Request) {
    return this.inbox.summary(req.staff!);
  }

  /** Configured inbox channels with their webhook path (`/api/v1` + path on the API's public URL). */
  @Get("channels")
  channelsList() {
    return this.inbox.channelList();
  }

  /** Active staff for the assignee picker. */
  @Get("agents")
  agents() {
    return this.inbox.agents();
  }

  /** Test helper: a fake inbound message on a mock channel (WhatsApp mock or chat-channel mock). */
  @Post("simulate")
  async simulate(@Body(new ZodValidationPipe(simulateInboundSchema)) body: SimulateInboundDto) {
    const instance = await this.channels.instanceById(body.instanceId);
    const adapter = instance ? this.channels.adapterFor(instance) : null;
    if (!instance || !adapter?.isMock) return { ok: false, message: "Pick a mock WhatsApp or chat channel provider." };
    const stored = await this.inbox.ingest(instance, adapter.channel, adapter.parse({ contactId: body.contactId, text: body.text, name: body.name, phone: body.phone }));
    return { ok: true, stored };
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.inbox.detail(id);
  }

  @Get(":id/context")
  context(@Param("id") id: string) {
    return this.inbox.context(id);
  }

  @Post(":id/reply")
  reply(@Param("id") id: string, @Body(new ZodValidationPipe(messageBodySchema)) body: MessageBodyDto, @Req() req: Request) {
    return this.inbox.reply(id, body.body, req.staff!);
  }

  @Post(":id/notes")
  note(@Param("id") id: string, @Body(new ZodValidationPipe(messageBodySchema)) body: MessageBodyDto, @Req() req: Request) {
    return this.inbox.note(id, body.body, req.staff!);
  }

  @Post(":id/suggestions")
  @HttpCode(200)
  @RequirePermissions("support.inbox", "ai.use")
  suggestions(@Param("id") id: string, @Req() req: Request) {
    return this.inbox.suggestions(id, req.staff!);
  }

  @Put(":id/assignee")
  assign(@Param("id") id: string, @Body(new ZodValidationPipe(assignSchema)) body: AssignDto, @Req() req: Request) {
    return this.inbox.assign(id, body.staffId, req.staff!, req.staff!.permissions.has("support.manage"));
  }

  @Put(":id/status")
  status(@Param("id") id: string, @Body(new ZodValidationPipe(conversationStatusSchema)) body: ConversationStatusDto, @Req() req: Request) {
    return this.inbox.setStatus(id, body.status, req.staff!);
  }

  @Put(":id/bot")
  bot(@Param("id") id: string, @Body(new ZodValidationPipe(botSchema)) body: BotDto, @Req() req: Request) {
    return this.inbox.setBot(id, body.active, req.staff!);
  }

  @Post(":id/orders")
  linkOrder(@Param("id") id: string, @Body(new ZodValidationPipe(linkOrderSchema)) body: LinkOrderDto, @Req() req: Request) {
    return this.inbox.linkOrder(id, body.orderId, req.staff!);
  }
}

@ApiTags("support")
@Controller("admin/support/tickets")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("support.tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listTicketsQuerySchema)) query: ListTicketsQueryDto, @Req() req: Request) {
    return this.tickets.list(query, req.staff!);
  }

  @Get("counts")
  counts(@Req() req: Request) {
    return this.tickets.counts(req.staff!);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.tickets.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicketDto, @Req() req: Request) {
    return this.tickets.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateTicketSchema)) body: UpdateTicketDto, @Req() req: Request) {
    return this.tickets.update(id, body, req.staff!);
  }

  @Post(":id/messages")
  addMessage(@Param("id") id: string, @Body(new ZodValidationPipe(ticketMessageSchema)) body: TicketMessageDto, @Req() req: Request) {
    return this.tickets.addMessage(id, body, req.staff!);
  }
}

@ApiTags("support")
@Controller("admin/support/canned-replies")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("support.inbox")
export class CannedRepliesController {
  constructor(private readonly canned: CannedRepliesService) {}

  @Get()
  list(@Query("q") q?: string) {
    return this.canned.list(q?.slice(0, 60));
  }

  @Post(":id/render")
  @HttpCode(200)
  render(@Param("id") id: string, @Body(new ZodValidationPipe(renderCannedSchema)) body: RenderCannedDto, @Req() req: Request) {
    return this.canned.render(id, body.conversationId, body.locale, req.staff!.name);
  }

  @Post()
  @RequirePermissions("support.manage")
  create(@Body(new ZodValidationPipe(cannedReplySchema)) body: CannedReplyDto, @Req() req: Request) {
    return this.canned.create(body, req.staff!);
  }

  @Patch(":id")
  @RequirePermissions("support.manage")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(cannedReplySchema.partial())) body: Partial<CannedReplyDto>, @Req() req: Request) {
    return this.canned.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("support.manage")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.canned.remove(id, req.staff!);
  }
}

@ApiTags("support")
@Controller("admin/support/calls")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("support.calls")
export class CallsController {
  constructor(private readonly telephony: TelephonyService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listCallsQuerySchema)) query: ListCallsQueryDto, @Req() req: Request) {
    return this.telephony.list({ staffId: query.mine ? req.staff!.id : undefined, orderId: query.orderId, page: query.page, pageSize: query.pageSize });
  }

  @Get("status")
  status(@Req() req: Request) {
    return this.telephony.status(req.staff!);
  }

  @Put("my-phone")
  setMyPhone(@Body(new ZodValidationPipe(myPhoneSchema)) body: MyPhoneDto, @Req() req: Request) {
    return this.telephony.setMyPhone(req.staff!, body.phone);
  }

  @Post()
  start(@Body(new ZodValidationPipe(startCallSchema)) body: StartCallDto, @Req() req: Request) {
    return this.telephony.startCall(body, req.staff!);
  }

  @Put(":id/outcome")
  outcome(@Param("id") id: string, @Body(new ZodValidationPipe(callOutcomeSchema)) body: CallOutcomeDto, @Req() req: Request) {
    return this.telephony.setOutcome(id, body.status, body.durationSeconds, req.staff!);
  }
}

/**
 * Provider webhooks (§4.3 rule 5). Inbox channels: Meta's GET subscription
 * check + signed POSTs. Telephony: status callbacks with an optional shared
 * secret. Unauthenticated by design — the signature/secret is the auth.
 */
@ApiTags("webhooks")
@Controller("webhooks")
export class SupportWebhooksController {
  constructor(
    private readonly webhooks: InboxWebhooksService,
    private readonly telephony: TelephonyService,
  ) {}

  @Get("inbox/:instanceId")
  async verify(@Param("instanceId") instanceId: string, @Query() query: Record<string, string | undefined>, @Res() res: Response) {
    const challenge = await this.webhooks.verifySubscription(instanceId, query["hub.mode"], query["hub.verify_token"], query["hub.challenge"]);
    res.type("text/plain").send(challenge);
  }

  @Post("inbox/:instanceId")
  @HttpCode(200)
  receive(@Param("instanceId") instanceId: string, @Body() body: unknown, @Req() req: RawBodyRequest<Request>, @Headers("x-hub-signature-256") signature: string | undefined) {
    return this.webhooks.receive(instanceId, body, req.rawBody, signature);
  }

  @Post("telephony/:instanceId")
  @HttpCode(200)
  telephonyStatus(@Param("instanceId") instanceId: string, @Body() body: unknown, @Query("secret") querySecret: string | undefined, @Headers("x-webhook-secret") headerSecret: string | undefined) {
    return this.telephony.webhook(instanceId, body, headerSecret ?? querySecret);
  }
}

/** Storefront live chat (§16 M15). The visitor is the API's own `anonymous_id` cookie; a logged-in customer is linked too. */
@ApiTags("store")
@Controller("store/support/chat")
@UseGuards(CustomerContextGuard)
export class StoreLiveChatController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  thread(@Query(new ZodValidationPipe(liveChatQuerySchema)) query: LiveChatQueryDto, @Req() req: Request) {
    return this.inbox.liveChatThread(req.customerContext!.anonymousId, query.after ?? null, query.locale);
  }

  @Post("messages")
  send(@Body(new ZodValidationPipe(liveChatSendSchema)) body: LiveChatSendDto, @Req() req: Request) {
    return this.inbox.liveChatSend(req.customerContext!.anonymousId, req.customerContext!.customer?.id ?? null, body);
  }

  @Post("handoff")
  @HttpCode(200)
  handoff(@Body(new ZodValidationPipe(liveChatHandoffSchema)) body: LiveChatHandoffDto, @Req() req: Request) {
    return this.inbox.liveChatHandoff(req.customerContext!.anonymousId, body.locale);
  }
}
