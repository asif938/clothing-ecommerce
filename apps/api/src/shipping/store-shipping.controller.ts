import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LocationsService } from "../locations/locations.service";
import { ShippingService } from "./shipping.service";
import { shippingQuoteQuerySchema, type ShippingQuoteQuery } from "./dto";

/** §7.5 checkout step 3 "delivery method: rates from 6.4 with fee and estimate". */
@ApiTags("store")
@Controller("store/shipping")
export class StoreShippingController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly locations: LocationsService,
  ) {}

  @Get("quote")
  async quote(@Query(new ZodValidationPipe(shippingQuoteQuerySchema)) query: ShippingQuoteQuery) {
    const area = await this.locations.validateChain(query.divisionId, query.districtId, query.areaId);
    const quote = await this.shipping.quote(
      { divisionId: query.divisionId, districtId: query.districtId, areaId: query.areaId, isDhakaCity: area.isDhakaCity },
      query.weightGrams,
      query.subtotal,
    );
    return quote ?? { zoneId: null, rates: [] };
  }
}
