import { Module } from "@nestjs/common";
import { IntakeController } from "./intake.controller";
import { IntakeService } from "./intake.service";
import { LeadReviewService } from "./lead-review.service";

@Module({
	controllers: [IntakeController],
	providers: [IntakeService, LeadReviewService],
	exports: [LeadReviewService],
})
export class IntakeModule {}
