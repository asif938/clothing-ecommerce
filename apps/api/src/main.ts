import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // /health and /ready stay unprefixed for load balancers / uptime checks
  // (docs/PROJECT_SPEC.md §11.2). Everything else lives under /api/v1/{store,admin,webhooks,public}.
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });

  const allowedOrigins = [process.env.STOREFRONT_URL, process.env.ADMIN_URL].filter(
    (origin): origin is string => Boolean(origin),
  );
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Fashion Commerce Platform API")
      .setDescription("See docs/PROJECT_SPEC.md §11 for conventions.")
      .setVersion("0.1.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
