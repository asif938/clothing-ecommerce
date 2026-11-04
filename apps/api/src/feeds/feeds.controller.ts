import { Controller, Get, Header, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { FeedsService } from "./feeds.service";

/** Public, unauthenticated-by-design (platforms fetch feed URLs directly) — gated by the `token` query param matching `feeds.secretToken` instead. Meta and Google both accept the identical Google-Shopping-style XML, so one builder backs both routes (see docs/DECISIONS.md). */
@ApiTags("feeds")
@Controller("feeds")
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Get("meta-catalog.xml")
  @Header("Content-Type", "application/xml")
  async metaCatalog(@Query("token") token?: string): Promise<string> {
    await this.feeds.assertAccessible(token);
    return this.feeds.buildXml();
  }

  @Get("google-merchant.xml")
  @Header("Content-Type", "application/xml")
  async googleMerchant(@Query("token") token?: string): Promise<string> {
    await this.feeds.assertAccessible(token);
    return this.feeds.buildXml();
  }
}
