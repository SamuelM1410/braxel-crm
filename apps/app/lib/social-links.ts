import LogoFacebook from "@carbon/icons-react/es/LogoFacebook";
import LogoGithub from "@carbon/icons-react/es/LogoGithub";
import LogoInstagram from "@carbon/icons-react/es/LogoInstagram";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import LogoX from "@carbon/icons-react/es/LogoX";
import Money from "@carbon/icons-react/es/Money";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import Video from "@carbon/icons-react/es/Video";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { safeHref } from "@crm/validation";

type SocialLink<T> = { key: keyof T; label: string; icon: CarbonIcon };

export type CompanyLinks = {
	linkedinUrl: string | null;
	twitterUrl: string | null;
	githubUrl: string | null;
	instagramUrl: string | null;
	facebookUrl: string | null;
	tiktokUrl: string | null;
	whatsappUrl: string | null;
	pricingUrl: string | null;
	careersUrl: string | null;
};

export type ContactLinks = {
	linkedinUrl: string | null;
	twitterUrl: string | null;
	githubUrl: string | null;
	instagramUrl: string | null;
	facebookUrl: string | null;
	tiktokUrl: string | null;
	whatsappUrl: string | null;
};

const COMPANY_LINKS: SocialLink<CompanyLinks>[] = [
	{ key: "linkedinUrl", label: "LinkedIn", icon: LogoLinkedin },
	{ key: "twitterUrl", label: "X", icon: LogoX },
	{ key: "githubUrl", label: "GitHub", icon: LogoGithub },
	{ key: "instagramUrl", label: "Instagram", icon: LogoInstagram },
	{ key: "facebookUrl", label: "Facebook", icon: LogoFacebook },
	{ key: "tiktokUrl", label: "TikTok", icon: Video },
	{ key: "whatsappUrl", label: "WhatsApp", icon: UserMultiple },
	{ key: "pricingUrl", label: "Pricing", icon: Money },
	{ key: "careersUrl", label: "Careers", icon: UserMultiple },
];

const CONTACT_LINKS: SocialLink<ContactLinks>[] = [
	{ key: "linkedinUrl", label: "LinkedIn", icon: LogoLinkedin },
	{ key: "twitterUrl", label: "X", icon: LogoX },
	{ key: "githubUrl", label: "GitHub", icon: LogoGithub },
	{ key: "instagramUrl", label: "Instagram", icon: LogoInstagram },
	{ key: "facebookUrl", label: "Facebook", icon: LogoFacebook },
	{ key: "tiktokUrl", label: "TikTok", icon: Video },
	{ key: "whatsappUrl", label: "WhatsApp", icon: UserMultiple },
];

function present<T>(record: T, links: SocialLink<T>[]) {
	return links.flatMap((link) => {
		// Enrichment writes these, so the scheme is not ours to trust.
		const href = safeHref(
			typeof record[link.key] === "string"
				? (record[link.key] as string)
				: null,
		);
		return href ? [{ ...link, href }] : [];
	});
}

export function companySocialLinks(company: CompanyLinks) {
	return present(company, COMPANY_LINKS);
}

export function contactSocialLinks(contact: ContactLinks) {
	return present(contact, CONTACT_LINKS);
}

export function hasCompanyLinks(company: CompanyLinks): boolean {
	return companySocialLinks(company).length > 0;
}

export function hasContactLinks(contact: ContactLinks): boolean {
	return contactSocialLinks(contact).length > 0;
}
