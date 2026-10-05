import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "contact-lock-spec";
const domains = ["pending", "approved", "rejected", "customer"].map(
	(name) => `${name}-${suffix}.invalid`,
);

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => undefined,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	new AgentQueueService(db),
	stamp,
	new FieldsService(db, agent),
);

function lead(status: "PENDING" | "APPROVED" | "REJECTED") {
	return [
		`Lead OS source: contact-lock-${suffix}-${status}`,
		"Etapa Lead OS: REVIEW_REQUIRED",
		`Revisión: ${status}`,
		`No contactar: ${status === "APPROVED" ? "no" : "sí"}`,
	].join("\n");
}

const ids: Record<string, string> = {};

async function clean() {
	await db.contact.deleteMany({
		where: { OR: domains.map((d) => ({ email: { endsWith: `@${d}` } })) },
	});
	await db.company.deleteMany({ where: { domain: { in: domains } } });
}

beforeAll(async () => {
	await clean();
	const rows = [
		{ key: "pending", description: lead("PENDING") },
		{ key: "approved", description: lead("APPROVED") },
		{ key: "rejected", description: lead("REJECTED") },
		{ key: "customer", description: "A customer we already sell to" },
	];
	for (const [index, row] of rows.entries()) {
		const domain = domains[index] ?? "";
		const company = await db.company.create({
			data: { name: `Lock ${row.key}`, domain, description: row.description },
			select: { id: true },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Lock",
				lastName: row.key,
				email: `person@${domain}`,
				phone: "+57 000 000 0000",
				whatsappUrl: `https://whatsapp.invalid/${row.key}`,
				companyId: company.id,
			},
			select: { id: true },
		});
		ids[row.key] = contact.id;
	}
});

afterAll(clean);

describe("a contact at a Lead OS lead", () => {
	it("stays locked until a person approves the lead", async () => {
		expect((await contacts.byId(ids.pending ?? "")).contactLock).toBe(
			"pending",
		);
	});

	it("is locked for good once the lead is rejected", async () => {
		expect((await contacts.byId(ids.rejected ?? "")).contactLock).toBe(
			"doNotContact",
		);
	});

	it("opens once the lead is approved", async () => {
		expect((await contacts.byId(ids.approved ?? "")).contactLock).toBeNull();
	});

	it("is never locked at a company that is not a Lead OS lead", async () => {
		expect((await contacts.byId(ids.customer ?? "")).contactLock).toBeNull();
	});

	it("does not send the company's dossier to the contact page", async () => {
		const contact = await contacts.byId(ids.pending ?? "");
		expect(contact.company?.name).toBe("Lock pending");
		expect(contact.company).not.toHaveProperty("description");
	});
});
