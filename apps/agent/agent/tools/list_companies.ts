import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "List companies in the CRM for prioritization. Include lead stage, preferred channel, website, phone, email, social channels, enrichment evidence and contact/deal counts. Use this before saying there are no leads; a company does not need an open deal.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ limit }) {
    const rows = await db.company.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        domain: true,
        website: true,
        industry: true,
        city: true,
        countryCode: true,
        phone: true,
        email: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        tiktokUrl: true,
        whatsappUrl: true,
        salesStage: true,
        preferredContactChannel: true,
        enrichmentStatus: true,
        enrichedAt: true,
        enrichment: { select: { source: true, raw: true, fetchedAt: true } },
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
        website: row.website,
        industry: row.industry,
        location: [row.city, row.countryCode].filter(Boolean).join(", ") || null,
        contactChannels: {
          phone: row.phone,
          email: row.email,
          linkedin: row.linkedinUrl,
          instagram: row.instagramUrl,
          facebook: row.facebookUrl,
          tiktok: row.tiktokUrl,
          whatsapp: row.whatsappUrl,
        },
        salesStage: row.salesStage,
        preferredContactChannel: row.preferredContactChannel,
        enrichmentStatus: row.enrichmentStatus,
        enrichedAt: row.enrichedAt?.toISOString() ?? null,
        evidence: row.enrichment
          ? { source: row.enrichment.source, fetchedAt: row.enrichment.fetchedAt.toISOString(), raw: row.enrichment.raw }
          : null,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        contacts: row._count.contacts,
        deals: row._count.deals,
      })),
      total: rows.length,
      note: "Estos son candidatos y empresas reales del CRM. Usa únicamente evidencia devuelta; no inventes scores u ofertas. Si faltan datos, recomienda la siguiente investigación.",
    };
  },
});
