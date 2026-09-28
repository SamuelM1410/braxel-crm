import type { Db } from "@crm/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { verifyUnsubscribeToken } from "./email-marketing";

@Injectable()
export class EmailUnsubscribeService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	isValid(token: string | undefined) {
		return Boolean(token && verifyUnsubscribeToken(token));
	}

	async unsubscribe(token: string | undefined) {
		const email = token ? verifyUnsubscribeToken(token) : null;
		if (!email) throw new BadRequestException("Invalid unsubscribe token.");

		await this.db.suppressedContact.upsert({
			where: { email },
			create: { email, reason: "email_one_click_unsubscribe" },
			update: { reason: "email_one_click_unsubscribe" },
		});

		return { ok: true as const };
	}
}
