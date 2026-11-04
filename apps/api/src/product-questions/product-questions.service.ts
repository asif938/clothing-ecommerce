import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { AnswerQuestionDto, AskQuestionDto, ListQuestionsQueryDto } from "./dto";

/** Product Q&A (docs/PROJECT_SPEC.md §5.5 `product_questions`, §8.2 "Reviews moderation and Q&A"). Answering sets status straight to `answered` — there's no separate "approve the question text" step; an unwanted question is instead moderated via `hidden`. */
@Injectable()
export class ProductQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  ask(customerId: string | null, dto: AskQuestionDto) {
    return this.prisma.productQuestion.create({ data: { productId: dto.productId, customerId, question: dto.question } });
  }

  async listPublic(productId: string) {
    return this.prisma.productQuestion.findMany({ where: { productId, status: "answered" }, orderBy: { createdAt: "desc" } });
  }

  async list(query: ListQuestionsQueryDto) {
    const where = { ...(query.productId ? { productId: query.productId } : {}), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.productQuestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { product: { select: { title: true, slug: true } }, customer: { select: { name: true, phone: true } } },
      }),
      this.prisma.productQuestion.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async answer(id: string, dto: AnswerQuestionDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.productQuestion.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Question not found");
    const question = await this.prisma.productQuestion.update({ where: { id }, data: { answer: dto.answer, status: "answered" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_question.answer", entityType: "product_question", entityId: id, before, after: question });
    return question;
  }

  async setHidden(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.productQuestion.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Question not found");
    const question = await this.prisma.productQuestion.update({ where: { id }, data: { status: "hidden" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_question.hide", entityType: "product_question", entityId: id, before, after: question });
    return question;
  }
}
