export const HACKATHON_DEMO = {
	flag: "HACKATHON_DEMO_MODE",
	enabledValue: "true",
	blockedEnvironments: ["production"],
} as const;

export function hackathonDemoRequested(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env[HACKATHON_DEMO.flag] === HACKATHON_DEMO.enabledValue;
}

export function hackathonDemoEnabled(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (!hackathonDemoRequested(env)) return false;
	return !HACKATHON_DEMO.blockedEnvironments.some(
		(name) => env.NODE_ENV === name || env.VERCEL_ENV === name,
	);
}
