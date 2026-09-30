-- ScrapeGraphAI is the only provider exposed for new runs. Keep legacy
-- values so existing audit history remains readable.
ALTER TYPE "ScraperProvider" ADD VALUE IF NOT EXISTS 'SCRAPEGRAPH';
