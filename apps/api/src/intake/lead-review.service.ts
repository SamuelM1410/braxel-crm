import { type Db } from "@crm/db";
import {
	BadGatewayException,
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDatabase } from "../database/database.constants";

export type LeadReviewDecision = "APPROVED" | "REJECTED";

@Injectable()
export class LeadReviewService {
	private readonly logger = new Logger(LeadReviewService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService,
	) {}

	async decide(
		companyId: string,
		decision: LeadReviewDecision,
		reviewer: string,
		reason?: string,
	) {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: { id: true, description: true },
		});
		if (!company) throw new NotFoundException(`No company with id ${companyId}.`);

		const sourceId = sourceIdFromDescription(company.description);
		if (!sourceId) {
			throw new BadRequestException("This company is not a Lead OS review lead.");
		}

		const response = await fetch(this.webhookUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId, decision, reviewedBy: reviewer, reason }),
		});
		if (!response.ok) {
			this.logger.error({
				message: "Lead OS review decision failed",
				companyId,
				decision,
			});
			throw new BadGatewayException("Lead OS could not save this review decision.");
		}

		await this.db.company.update({
			where: { id: companyId },
			data: {
				description: withReviewDecision(company.description, decision, reviewer, reason),
			},
		});
		return { decision };
	}

	private webhookUrl() {
		return (
			this.config.get<string>("LEAD_OS_REVIEW_WEBHOOK_URL") ??
			"http://host.docker.internal:5678/webhook/agency-lead-os-review-decision"
		);
	}
}

function sourceIdFromDescription(description: string | null) {
	return description?.match(/^Lead OS source:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

function withReviewDecision(
	description: string | null,
	decision: LeadReviewDecision,
	reviewer: string,
	reason?: string,
) {
	const lines = (description ?? "").split("\n");
	const next = lines.filter(
		(line) => !/^Revisión:|^No contactar:|^Revisado por:|^Motivo de revisión:/.test(line),
	);
	next.push(`Revisión: ${decision}`);
	next.push(`No contactar: ${decision === "REJECTED" ? "sí" : "no"}`);
	next.push(`Revisado por: ${reviewer}`);
	next.push(`Motivo de revisión: ${reason?.trim() || "Sin motivo registrado"}`);
	return next.join("\n");
}
