import { Button } from "@crm/ui/components/button";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import type { ContactLock } from "@crm/validation";
import { CONTACT_LOCK_MESSAGE } from "@/lib/contact-lock";
import {
	type CompanyLinks,
	type ContactLinks,
	companySocialLinks,
	contactSocialLinks,
} from "@/lib/social-links";

function SocialLinks({
	rows,
	lock,
}: {
	rows: Array<{
		key: PropertyKey;
		label: string;
		icon: CarbonIcon;
		href: string;
	}>;
	lock: ContactLock | null;
}) {
	if (rows.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<p className="text-muted-foreground text-xs">
				{lock
					? CONTACT_LOCK_MESSAGE[lock]
					: "Canales encontrados en fuentes públicas. Verifica el responsable y la preferencia antes de contactar."}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				{rows.map((link) =>
					lock ? (
						<Button key={String(link.key)} variant="outline" size="sm" disabled>
							<Icon icon={link.icon} data-icon="inline-start" />
							{link.label}
						</Button>
					) : (
						<Button key={String(link.key)} asChild variant="outline" size="sm">
							<a href={link.href} target="_blank" rel="noreferrer noopener">
								<Icon icon={link.icon} data-icon="inline-start" />
								{link.label}
							</a>
						</Button>
					),
				)}
			</div>
		</div>
	);
}

export function CompanySocials({
	company,
	lock = null,
}: {
	company: CompanyLinks;
	lock?: ContactLock | null;
}) {
	return <SocialLinks rows={companySocialLinks(company)} lock={lock} />;
}

export function ContactSocials({
	contact,
	lock = null,
}: {
	contact: ContactLinks;
	lock?: ContactLock | null;
}) {
	return <SocialLinks rows={contactSocialLinks(contact)} lock={lock} />;
}
