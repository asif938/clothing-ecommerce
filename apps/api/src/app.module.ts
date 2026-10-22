import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
      },
    }),
    HealthModule,
    // One module per bounded context is added here starting Milestone 1
    // (auth, staff, rbac, audit, settings, setup-wizard, i18n, media, catalog, ...
    // see docs/PROJECT_SPEC.md §3.4).
  ],
})
export class AppModule {}
