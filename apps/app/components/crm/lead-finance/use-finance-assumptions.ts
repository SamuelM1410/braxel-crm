"use client";

import {
	defaultAssumptions,
	type FinanceAssumptions,
	financeAssumptions,
	isValidAssumptions,
} from "@crm/validation";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "braxel.lead-finance.assumptions";

function readStored(): FinanceAssumptions | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = financeAssumptions.safeParse(JSON.parse(raw));
		return parsed.success && isValidAssumptions(parsed.data)
			? parsed.data
			: null;
	} catch {
		return null;
	}
}

function writeStored(value: FinanceAssumptions | null) {
	try {
		if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		else window.localStorage.removeItem(STORAGE_KEY);
	} catch {}
}

export function useFinanceAssumptions() {
	const [assumptions, setAssumptions] = useState<FinanceAssumptions>(() =>
		defaultAssumptions(),
	);

	useEffect(() => {
		const stored = readStored();
		if (stored) setAssumptions(stored);
	}, []);

	const update = useCallback((next: FinanceAssumptions) => {
		setAssumptions(next);
		if (isValidAssumptions(next)) writeStored(next);
	}, []);

	const reset = useCallback(() => {
		setAssumptions(defaultAssumptions());
		writeStored(null);
	}, []);

	return { assumptions, update, reset };
}
