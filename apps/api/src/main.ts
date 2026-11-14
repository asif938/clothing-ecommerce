import "reflect-metadata";
import cookieParser from "cookie-parser";
import { json } from "express";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  // `rawBody` keeps the exact request bytes on `req.rawBody` — Meta webhook signatures (§16 M15) are an HMAC of them.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  // §16 M17 config bundles carry whole CMS pages and UI string tables, well over
  // the 100 kb default. Parsed here, ahead of Nest's default parser (which skips
  // an already-parsed body), and only for that one route.
  // Wrapped in an arrow function on purpose: Express's parser is a function
  // named `jsonParser`, and Nest's ExpressAdapter skips registering its own
  // global JSON parser when it finds a middleware with that name in the stack
  // — passing `json(...)` directly left every other route with `req.body`
  // undefined (every POST failed validation; see docs/DECISIONS.md 2026-11-14).
  const configBundleJson = json({ limit: "10mb" });
  app.use("/api/v1/admin/config-bundle/import", (req: Parameters<typeof configBundleJson>[0], res: Parameters<typeof configBundleJson>[1], next: Parameters<typeof configBundleJson>[2]) =>
    configBundleJson(req, res, next),
  );

  // §12 baseline security headers. No CSP here — this is a JSON API
  // consumed server-side by the storefront/admin's own proxy routes, not an
  // HTML-rendering surface (the two Next.js apps carry the real CSP, in
  // their own next.config.mjs `headers()`).
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // /health, /ready (uptime checks, §11.2) and /media/* (public file serving,
  // see MediaFilesController) stay unprefixed. Everything else lives under
  // /api/v1/{store,admin,webhooks,public}.
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready", "media/*splat"] });

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
