import os
import hashlib
import httpx
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from typing import Any, Literal

# ScrapeGraphAI currently imports this helper from an older LangChain path.
# Keep the worker compatible with the installed LangChain release.
from langchain.chat_models.base import init_chat_model
from langchain_core.language_models import chat_models
if not hasattr(chat_models, "init_chat_model"):
    chat_models.init_chat_model = init_chat_model
from langchain_ollama import ChatOllama
from langchain_community import chat_models as community_chat_models
if not hasattr(community_chat_models, "ChatOllama"):
    community_chat_models.ChatOllama = ChatOllama
try:
    # Newer LangChain distributions moved these helpers to langchain-classic.
    from langchain_classic.output_parsers.structured import ResponseSchema, StructuredOutputParser
except ModuleNotFoundError:
    # Keep the worker bootable with the LangChain 0.3.x stack used here.
    from langchain.output_parsers import ResponseSchema, StructuredOutputParser
from langchain_core import output_parsers
if not hasattr(output_parsers, "ResponseSchema"):
    output_parsers.ResponseSchema = ResponseSchema
if not hasattr(output_parsers, "StructuredOutputParser"):
    output_parsers.StructuredOutputParser = StructuredOutputParser

from scrapegraphai.graphs import SmartScraperGraph
from langchain_openai import ChatOpenAI

app = FastAPI(title="Agency Lead OS ScrapeGraphAI Worker")


class ResearchRequest(BaseModel):
    url: HttpUrl
    company_name: str | None = None
    city: str | None = None
    source_url: HttpUrl | None = None


class EvaluationRequest(BaseModel):
    """Evidence-only input for Eve; raw social/private content is not accepted."""
    company_name: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class MindcaseRequest(BaseModel):
    """Run one of Mindcase's social-data agents (never Google Maps)."""
    agent: Literal[
        "instagram/profiles", "instagram/posts",
        "tiktok/profiles", "tiktok/posts",
        "linkedin/profiles", "linkedin/companies", "linkedin/posts",
        "facebook/pages", "facebook/posts-groups",
    ]
    params: dict[str, Any] = Field(default_factory=dict)
    wait: bool = True


class MindcaseIntakeRequest(MindcaseRequest):
    """Run a public-social agent and forward safe candidates to the CRM."""
    max_leads: int = Field(default=50, ge=1, le=50)


class EvaluationResult(BaseModel):
    status: Literal["REVIEW_REQUIRED", "NURTURE", "EXCLUDE"]
    evidence_quality: int = Field(ge=0, le=100)
    commercial_opportunity: int = Field(ge=0, le=100)
    contact_priority: int = Field(ge=0, le=100)
    scenario: str
    pain: str
    recommended_offer: str
    price_guidance: str
    recommended_channel: Literal["PHONE", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "EMAIL", "NONE"]
    next_action: str
    opening_script: str
    objection_handling: list[dict[str, str]] = Field(default_factory=list)
    evidence_used: list[dict[str, Any]] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    guardrails: list[str] = Field(default_factory=list)
    # Outreach is always human-gated.  Keeping this explicit in the API
    # response prevents downstream clients from treating a recommendation as
    # permission to contact a prospect.
    requires_human_approval: bool = True


BLOCKED_HOSTS = {
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "linkedin.com",
    "empresite.com",
    "mercadolibre.com",
}


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": os.getenv("SCRAPEGRAPH_MODEL", "ollama/qwen2.5:3b"),
        "evaluator_model": os.getenv("EVALUATOR_MODEL", "gpt-5-mini"),
        "evaluator_ready": bool(os.getenv("OPENAI_API_KEY")),
        "mindcase_ready": bool(os.getenv("MINDCASE_API_KEY")),
        "mindcase_intake_ready": bool(
            os.getenv("MINDCASE_API_KEY")
            and os.getenv("CRM_INTAKE_URL")
            and os.getenv("CRM_INTAKE_SECRET")
        ),
    }


@app.post("/mindcase/run")
def run_mindcase(request: MindcaseRequest):
    """Fetch public social signals from Mindcase for CRM enrichment.

    The allow-list intentionally excludes Maps and all messaging/sending
    capabilities. Mindcase remains a discovery provider; Eve decides whether
    a channel is usable and outreach remains separately approval-gated.
    """
    api_key = os.getenv("MINDCASE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="MINDCASE_API_KEY is not configured")
    query = "?wait=true" if request.wait else ""
    url = f"https://api.mindcase.co/v1/data/{request.agent}/run{query}"
    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"params": request.params},
            timeout=90,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as error:
        detail = error.response.text[:500]
        raise HTTPException(status_code=502, detail=f"Mindcase request failed: {detail}") from error
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"Mindcase request failed: {type(error).__name__}") from error
    rows = data.get("data") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        rows = [rows] if rows else []
    return {
        "provider": "mindcase",
        "agent": request.agent,
        "rows": rows,
        "count": len(rows),
        "source": "public_social_data",
        "contact_channels": normalize_contact_channels({"result": rows}, "mindcase://" + request.agent),
    }


@app.post("/mindcase/intake")
def mindcase_intake(request: MindcaseIntakeRequest):
    """Forward filtered public-social candidates to the CRM intake endpoint."""
    api_key = os.getenv("MINDCASE_API_KEY")
    intake_url = os.getenv("CRM_INTAKE_URL")
    intake_secret = os.getenv("CRM_INTAKE_SECRET")
    if not api_key:
        raise HTTPException(status_code=503, detail="MINDCASE_API_KEY is not configured")
    if not intake_url or not intake_secret:
        raise HTTPException(
            status_code=503,
            detail="CRM_INTAKE_URL and CRM_INTAKE_SECRET are not configured",
        )

    result = run_mindcase(request)
    leads = [
        lead
        for row in result["rows"]
        if (lead := mindcase_row_to_lead(row, request.agent)) is not None
    ][: request.max_leads]
    if not leads:
        return {"provider": "mindcase", "imported": 0, "skipped": len(result["rows"]), "reason": "No rows had a verifiable business identity."}

    try:
        response = httpx.post(
            intake_url,
            headers={"Authorization": f"Bearer {intake_secret}", "Content-Type": "application/json"},
            json={"leads": leads},
            timeout=60,
        )
        response.raise_for_status()
        imported = response.json()
    except httpx.HTTPStatusError as error:
        raise HTTPException(status_code=502, detail=f"CRM intake failed: {error.response.text[:500]}") from error
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"CRM intake failed: {type(error).__name__}") from error

    return {
        "provider": "mindcase",
        "agent": request.agent,
        "candidates": len(leads),
        "skipped": len(result["rows"]) - len(leads),
        "crm": imported,
    }


@app.post("/evaluate", response_model=EvaluationResult)
def evaluate(request: EvaluationRequest):
    """Run Eve only after cheap extraction; require evidence and return strict JSON."""
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")

    prompt = (
        "Eres Eve, evaluadora comercial B2B. Usa únicamente la evidencia JSON suministrada. "
        "No inventes ingresos, presupuesto, cargos, intención ni actividad. "
        "Si falta evidencia, indícalo y baja los scores. EXCLUDE directorios, duplicados o identidades no verificables. "
        "Recomienda una oferta concreta solo si existe un problema observable. "
        "No envíes mensajes, no contactes a nadie y exige aprobación humana. "
        "Devuelve exclusivamente el esquema estructurado solicitado.\n\n"
        f"Empresa: {request.company_name or 'desconocida'}\n"
        f"Evidencia: {request.evidence}"
    )
    try:
        model = ChatOpenAI(
            model=os.getenv("EVALUATOR_MODEL", "gpt-5-mini"),
            temperature=0,
            max_retries=1,
        ).with_structured_output(EvaluationResult)
        result = model.invoke(prompt)
        payload = result.model_dump() if isinstance(result, EvaluationResult) else dict(result)
        payload["requires_human_approval"] = True
        payload.setdefault("guardrails", [])
        if "No se envían mensajes sin aprobación humana." not in payload["guardrails"]:
            payload["guardrails"].append("No se envían mensajes sin aprobación humana.")
        return payload
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Eve evaluation failed: {type(error).__name__}") from error


@app.post("/research")
def research(request: ResearchRequest):
    hostname = (urlparse(str(request.url)).hostname or "").removeprefix("www.").lower()
    if any(hostname == blocked or hostname.endswith("." + blocked) for blocked in BLOCKED_HOSTS):
        raise HTTPException(status_code=422, detail="This worker only researches public owned websites, not social networks or directories.")
    prompt = """Extract only facts visible on this public business website. Return compact JSON with:
        company_description, visible_services,
        public_contact{
          emails,
          phones,
          whatsapp_urls,
          whatsapp_numbers
        },
        contact_methods[{type,value,status,confidence,source_url}],
        conversion_assets{forms,booking_urls,cta_text},
        technology_signals{analytics,meta_pixel,ecommerce_platform},
        social_links[{network,url,status,confidence,source_url}],
        evidence_items[{claim,source_url,observed_at,confidence}].

        Contact extraction rules:
        - Inspect header, footer, contact page, buttons, mailto/tel links, JSON-LD and visible text.
        - Extract every public phone number, preserving the displayed value and also returning a normalized digits-only value when possible.
        - Treat a WhatsApp link as WhatsApp only when it is an explicit wa.me, api.whatsapp.com/send, chat.whatsapp.com or whatsapp:// link. Do not infer WhatsApp merely from a phone number.
        - Follow only same-site public contact/about links needed to find official contact channels; do not log in or message anyone.
        - Record the exact source URL for every channel and leave absent values empty.
        - Social links must be official profile/page URLs visibly linked by the business website. Never invent a profile from the company name.
        Never guess revenue, budget, customer count, decision makers, ad spend, or business problems. If absent, return an empty value."""
    config = {
        # Keep the provider block limited to the model name.  ScrapeGraphAI
        # forwards unknown keys to the OpenAI client; options such as
        # `model_tokens` and `format` therefore fail at runtime with an opaque
        # `unexpected keyword argument` error.
        "llm": {"model": os.getenv("SCRAPEGRAPH_MODEL", "ollama/qwen2.5:3b")},
        "verbose": False,
        "headless": True,
    }
    try:
        result = SmartScraperGraph(prompt=prompt, source=str(request.url), config=config).run()
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Research worker failed: {type(error).__name__}") from error
    return {
        "source_url": str(request.url),
        "company_name": request.company_name,
        "result": result,
        "contact_channels": normalize_contact_channels(result, str(request.url)),
    }


def normalize_contact_channels(result: Any, source_url: str) -> list[dict[str, Any]]:
    """Flatten public contact/social findings for the CRM ingestion contract.

    The scraper may return either the requested nested shape or slightly
    different keys depending on the page.  Normalising here means the CRM
    receives phone, WhatsApp and social URLs consistently, with provenance and
    confidence preserved.  Nothing is marked verified automatically.
    """
    if not isinstance(result, dict):
        return []
    channels: list[dict[str, Any]] = []
    public = result.get("public_contact") or {}
    for kind, values in (
        ("email", public.get("emails")),
        ("phone", public.get("phones")),
        ("whatsapp", public.get("whatsapp_urls")),
        ("whatsapp", public.get("whatsapp_numbers")),
    ):
        if isinstance(values, str):
            values = [values]
        if isinstance(values, list):
            channels.extend({"type": kind, "value": str(v), "source_url": source_url, "confidence": 70, "verified": False} for v in values if v)
    methods = result.get("contact_methods") or []
    if isinstance(methods, list):
        for item in methods:
            if isinstance(item, dict) and item.get("value"):
                channels.append({"type": item.get("type", "other"), "value": str(item["value"]), "source_url": item.get("source_url") or source_url, "confidence": item.get("confidence", 60), "verified": item.get("status") == "verified"})
    socials = result.get("social_links") or []
    if isinstance(socials, list):
        for item in socials:
            if isinstance(item, dict) and item.get("url"):
                channels.append({"type": item.get("network", "social"), "value": str(item["url"]), "source_url": item.get("source_url") or source_url, "confidence": item.get("confidence", 60), "verified": item.get("status") == "verified"})
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for item in channels:
        unique[(item["type"], item["value"])] = item
    return list(unique.values())


def mindcase_row_to_lead(row: Any, agent: str) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None

    def value(*keys: str) -> str | None:
        for key in keys:
            candidate = row.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None

    def url_value(*keys: str) -> str | None:
        candidate = value(*keys)
        return candidate if candidate and candidate.startswith(("http://", "https://")) else None

    name = value("company_name", "companyName", "business_name", "businessName", "name", "title")
    website = url_value("website", "website_url", "websiteUrl", "domain", "url")
    phone = value("phone", "phone_number", "phoneNumber", "telephone", "mobile")
    email_candidate = value("email", "email_address", "emailAddress")
    email = email_candidate if email_candidate and "@" in email_candidate else None
    instagram = url_value("instagram", "instagram_url", "instagramUrl", "instagram_profile")
    facebook = url_value("facebook", "facebook_url", "facebookUrl", "facebook_page")
    tiktok = url_value("tiktok", "tiktok_url", "tiktokUrl", "tiktok_profile")
    linkedin = url_value("linkedin", "linkedin_url", "linkedinUrl", "linkedin_profile", "profile_url")
    source_url = url_value("source_url", "sourceUrl", "profile_url", "url")
    city = value("city", "location", "address")
    if not name or not any((website, phone, email, instagram, facebook, tiktok, linkedin)):
        return None

    identity = "|".join(str(row.get(key, "")) for key in ("id", "url", "profile_url", "name", "company_name"))
    source_id = f"mindcase:{agent}:{hashlib.sha256(identity.encode()).hexdigest()[:24]}"
    return {
        "sourceId": source_id,
        "companyName": name,
        "websiteUrl": website,
        "city": city,
        "phone": phone,
        "email": email,
        "instagramUrl": instagram,
        "facebookUrl": facebook,
        "tiktokUrl": tiktok,
        "whatsappUrl": url_value("whatsapp_url", "whatsappUrl", "whatsapp"),
        "sourceUrl": source_url,
        "pipelineStage": "REVIEW_REQUIRED",
        "reviewStatus": "PENDING",
        "doNotContact": True,
        "reviewReason": "Candidato público de Mindcase. Requiere evidencia y aprobación humana.",
        "researchSummary": f"Fuente social pública: {agent}.",
    }
