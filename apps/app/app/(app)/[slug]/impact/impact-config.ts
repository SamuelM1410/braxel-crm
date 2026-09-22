export const IMPACT_COPY = {
	guardrails: [
		"El canal de contacto de un lead solo se habilita cuando existe una aprobación humana registrada y el lead no está en No contactar.",
		"Aprobar o rechazar exige un motivo de al menos 10 caracteres, validado en la interfaz y en la API.",
		"Cada decisión queda en el historial de la empresa con quién la tomó, cuándo y por qué.",
		"Un lead rechazado queda en No contactar y su canal permanece bloqueado.",
		"Eve solo investiga y prepara borradores: no aprueba leads, no envía mensajes y no puede sobrescribir una decisión humana.",
	],
	pipeline: [
		{
			title: "1. Ingesta",
			text: "El lead entra por el endpoint de intake con sus señales públicas.",
		},
		{
			title: "2. Cola durable",
			text: "La API escribe una fila AgentTask en Postgres y no espera a la IA.",
		},
		{
			title: "3. Investigación de Eve",
			text: "El agente toma la tarea, reúne evidencia y escribe el dossier con puntajes y oferta.",
		},
		{
			title: "4. Revisión humana",
			text: "Una persona aprueba o rechaza y explica por qué. Es el único paso manual.",
		},
		{
			title: "5. Contacto autorizado",
			text: "Solo un lead aprobado habilita su canal de contacto.",
		},
	],
	scales: [
		"La ingesta y la investigación están desacopladas: la API solo escribe una fila y el agente la procesa cuando puede.",
		"La cola es una tabla de Postgres y las tareas se reclaman con FOR UPDATE SKIP LOCKED, así que varios trabajadores no duplican trabajo.",
		"La API, la app y el agente son tres despliegues independientes que comparten una base de datos.",
		"El costo humano por lead es la revisión, no la investigación.",
	],
	limits: [
		"Es una instalación de una sola organización: las empresas de la demo son prospectos, no clientes separados.",
		"Toda la carga comparte una base Postgres.",
		"La capacidad de revisión la limita el equipo humano.",
		"Los minutos por lead son supuestos configurables, no mediciones.",
	],
} as const;
