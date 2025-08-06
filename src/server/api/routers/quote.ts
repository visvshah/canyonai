import { z } from "zod";
import { Prisma } from "@prisma/client";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const quoteRouter = createTRPCRouter({
  /**
   * Fetch all quotes. Optionally filter by a search string that matches the
   * customer name or organisation name (case-insensitive, partial match).
   */
  all: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
  const containsKeyword = (value: string) => ({
        contains: value,
      });

      const where: Prisma.QuoteWhereInput = input?.search
        ? {
            OR: [
              { customerName: containsKeyword(input.search) },
              {
                org: {
                  is: {
                    name: containsKeyword(input.search),
                  },
                },
              },
            ],
          }
        : {};

      return ctx.db.quote.findMany({
        where,
        include: {
          org: true,
          package: true,
          approvalWorkflow: {
            include: {
              steps: {
                include: {
                  approver: true,
                },
                orderBy: { stepOrder: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),
});
