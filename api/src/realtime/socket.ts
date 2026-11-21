import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import type { Config } from "../config.js";
import type { AlertPayload, CrawlStatusPayload } from "../types/internal.js";

export type ServerToClientEvents = {
  "alert:new": (payload: AlertPayload) => void;
  "crawl:status": (payload: CrawlStatusPayload) => void;
};

export type Io = Server<Record<string, never>, ServerToClientEvents>;

export function createSocketServer(app: FastifyInstance, config: Config): Io {
  const io: Io = new Server(app.server, {
    cors: { origin: config.WEB_ORIGIN },
  });

  io.on("connection", (socket) => {
    app.log.info({ socketId: socket.id }, "socket connected");
    socket.on("disconnect", (reason) => {
      app.log.info({ socketId: socket.id, reason }, "socket disconnected");
    });
  });

  app.addHook("onClose", async () => {
    // Server may not be listening (e.g. app.inject in tests): ignore that close error.
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
  });

  return io;
}
