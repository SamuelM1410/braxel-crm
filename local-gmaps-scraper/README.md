# Legacy local Maps discovery

This is the legacy browser-based discovery source used by the CRM when it is
running locally. It does not use Mindcase or a Google Maps API key. It only
discovers public Google Maps listings; the CRM then enriches each public
website through ScrapeGraph and keeps every import review-gated.

## Start locally

From the repository root:

```bash
cd local-gmaps-scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn main_api:app --host 127.0.0.1 --port 8001
```

Keep this process running while using a local API instance. The CRM calls
`http://127.0.0.1:8001/scrape-get` automatically in development when
`LOCAL_MAPS_SCRAPER_URL` is unset.

Vercel cannot reach a developer's `127.0.0.1`. For the deployed CRM, host this
service behind a public HTTPS URL and set `LOCAL_MAPS_SCRAPER_URL`, or configure
`GOOGLE_MAPS_API_KEY` instead.
