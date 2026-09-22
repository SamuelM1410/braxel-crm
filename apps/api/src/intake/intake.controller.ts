import { webUrl } from "@crm/validation";
import {
	BadRequestException,
	Body,
	Controller,
	Headers,
	Post,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { z } from "zod";
import { IntakeService } from "./intake.service";
import { leadOsDossierSchema } from "./lead-os-dossier";

const leadSchema = z.object({
	sourceId: z.string().trim().min(1).max(160),
	companyName: z.string().trim().min(1).max(240),
	websiteUrl: webUrl.optional().nullable(),
	city: z.string().trim().max(120).optional().nullable(),
	niche: z.string().trim().max(120).optional().nullable(),
	phone: z.string().trim().max(80).optional().nullable(),
	email: z.string().trim().email().max(320).optional().nullable(),
	instagramUrl: webUrl.optional().nullable(),
	facebookUrl: webUrl.optional().nullable(),
	tiktokUrl: webUrl.optional().nullable(),
	whatsappUrl: webUrl.optional().nullable(),
	contactName: z.string().trim().max(180).optional().nullable(),
	contactRole: z.string().trim().max(180).optional().nullable(),
	score: z.number().min(0).max(100).optional().nullable(),
	recommendedOffer: z.string().trim().max(80).optional().nullable(),
	offerReason: z.string().trim().max(2000).optional().nullable(),
	researchSummary: z.string().trim().max(5000).optional().nullable(),
	painHypothesis: z.string().trim().max(2000).optional().nullable(),
	reviewReason: z.string().trim().max(2000).optional().nullable(),
	sourceUrl: webUrl.optional().nullable(),
	pipelineStage: z.string().trim().max(80).optional().nullable(),
	reviewStatus: z.string().trim().max(80).optional().nullable(),
	doNotContact: z.boolean().optional(),
	dossier: leadOsDossierSchema.optional().nullable(),
	updateOnly: z.boolean().optional(),
});

const intakeSchema = z.object({
	leads: z.array(leadSchema).min(1).max(50),
});

@Controller("api/intake")
export class IntakeController {
	constructor(
		private readonly config: ConfigService,
		private readonly intake: IntakeService,
	) {}

	@Post("lead-os")
	@AllowAnonymous()
	async importLeads(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		const secret = this.config.get<string>("CRM_INTAKE_SECRET");
		if (!secret || authorization !== `Bearer ${secret}`) {
			throw new UnauthorizedException();
		}

		const parsed = intakeSchema.safeParse(body);
		if (!parsed.success) {
			throw new BadRequestException({
				message: "Invalid Lead OS payload",
				issues: parsed.error.issues.map((issue) => ({
					path: issue.path.join("."),
					message: issue.message,
				})),
			});
		}

		return this.intake.import(parsed.data.leads);
	}
}
