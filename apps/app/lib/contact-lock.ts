import type { ContactLock } from "@crm/validation";

export const CONTACT_LOCK_MESSAGE: Record<ContactLock, string> = {
	pending: "Bloqueados hasta que una persona apruebe este lead con un motivo.",
	doNotContact: "Bloqueados: el lead está marcado como No contactar.",
};
