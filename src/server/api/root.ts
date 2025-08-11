import { quoteRouter } from "~/server/api/routers/quote";
import { insightsRouter } from "~/server/api/routers/insights";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  quote: quoteRouter,
  insights: insightsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
