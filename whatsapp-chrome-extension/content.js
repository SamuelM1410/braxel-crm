(function () {
	"use strict";

	const params = new URLSearchParams(window.location.search);
	if (params.get("braxel_auto_send") !== "1") return;

	const message = params.get("text")?.trim();
	if (!message) return;

	const key = `braxel-whatsapp-sent:${window.location.href}`;
	if (sessionStorage.getItem(key)) return;

	const sendButtonSelectors = [
		'button[aria-label="Send"]',
		'button[aria-label="Enviar"]',
		'button[data-testid="compose-btn-send"]',
		'[data-icon="send"]',
	];

	function findSendButton() {
		for (const selector of sendButtonSelectors) {
			const element = document.querySelector(selector);
			if (!element) continue;
			return element.closest("button") || element;
		}
		return null;
	}

	function tryToSend() {
		const button = findSendButton();
		if (!button || button.disabled) return false;
		button.click();
		sessionStorage.setItem(key, "1");
		return true;
	}

	let attempts = 0;
	const timer = window.setInterval(() => {
		attempts += 1;
		if (tryToSend() || attempts >= 60) window.clearInterval(timer);
	}, 500);
})();
