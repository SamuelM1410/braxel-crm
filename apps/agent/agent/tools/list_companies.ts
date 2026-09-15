import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "List companies in the CRM, including identity, industry, activity and contact/deal counts. Use this for questions about best leads or companies needing an offer, even when they have no open deals.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ limit }) {
    const rows = await db.company.findMany({
      orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        domain: true,
        industry: true,
        lastActivityAt: true,
        createdAt: true,
        _count: { select: { contacts: true, deals: true } },
      },
    });

    return {
      companies: rows.map((row) => ({
        id: row.id,
        name: row.name,
        domain: row.domain,
        industry: row.industry,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        contacts: row._count.contacts,
        deals: row._count.deals,
      })),
      total: rows.length,
      note: "Son empresas reales del CRM. No requieren un deal abierto para ser evaluadas; no inventes scores, ofertas ni datos de contacto que no aparezcan en los resultados.",
    };
  },
});
