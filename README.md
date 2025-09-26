# AI Recommender — powered by Arena

Fast, single-page quiz that recommends top AI models using an n8n webhook and stores analytics + responses in Supabase.

## Quick Start
1) Open index.html and paste your ENV keys into the window.ENV block near the top:
```
window.ENV = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY",
  N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/ai-recommender",
  GA_MEASUREMENT_ID: "G-XXXXXXX",   // optional
  META_PIXEL_ID: "1234567890"       // optional
};
```
2) Save and use the Publish tab to deploy.

To deploy your website and make it live, please go to the Publish tab where you can publish your project with one click. The Publish tab will handle all deployment processes automatically and provide you with the live website URL.

## Features Implemented
- Landing page with hero, social proof, and how-it-works
- 30-second quiz (3 steps + optional email)
- Progress indicator and validation (all questions required; email optional with basic regex)
- Category-specific Q3 branching based on Q1 (Education, Writing, Coding, Business, Other)
- Supabase inserts:
  - responses: raw submission stored before webhook call (channel stores Q3 key)
  - events: page_view, quiz_start, quiz_submit, recommendation_shown, cta_click
- n8n webhook call with 6s timeout. On success, shows top 3 models; on failure, shows graceful fallback and marks status=pending
- Results section with top 3 cards, source badge, note, Save result, Copy link, Try again
- Test buttons: Simulate Webhook Success / Simulate Webhook Fail
- Basic SEO (title, description, OpenGraph) and favicon
- Mobile-first responsive UI with Tailwind CSS
- Optional GA and Meta Pixel (only loaded if IDs are provided)

## Pages / Entry Points
- / (index.html) — main landing + modal quiz + results section
- #privacy — inline privacy section
- #terms — inline terms section

URL Parameters captured:
- utm_source|source, utm_medium|medium, utm_campaign|campaign — included in submission payload
- rid (optional, used only by Copy link to result generation)

## Data Flow
1) On page load: events insert with type='page_view'
2) On quiz open: type='quiz_start'
3) On quiz submit: type='quiz_submit' + insert into responses with status='received'
4) POST payload to N8N_WEBHOOK_URL (JSON below). If 200 OK, render results, update responses.result + status='recommended', then events type='recommendation_shown'. If timeout (>6s) or non-200, show fallback message and update status='pending'.

Payload JSON to webhook:
```
{
  "use_case": "<chat|code|writing|analysis|research|education|creative>",
  "category": "<Education|Writing|Coding|Business|Other>",
  "priority": "<quality|speed|cost|reasoning>",
  "q2": "<same as priority>",
  "q3_key": "<tutor|research|practice|creative|pro_docs|academic|code_completion|learn_code|automation|save_time|gen_content|analytics|easy|specialized|flexible>",
  "q3_value": "<human-readable label>",
  "channel": "<same as q3_key>",
  "email": "<string|null>",
  "client_ts": "<ISO timestamp>",
  "utm": { "source": "...", "medium": "...", "campaign": "..." }
}
```

Expected webhook response (200):
```
{
  "date": "YYYY-MM-DD",
  "task": "text",
  "top": [
    {"model":"...", "rank": 1, "score": 1456, "reason":"..."},
    {"model":"...", "rank": 2, "score": 1441, "reason":"..."},
    {"model":"...", "rank": 3, "score": 1430, "reason":"..."}
  ],
  "note": "any alert (e.g., data stale)"
}
```

## Supabase
Tables (SQL reference):
```
-- public.responses
id uuid PK default gen_random_uuid()
use_case text not null
priority text not null
channel text not null  -- stores Q3 key (e.g., tutor, research, code_completion, ...)
email text
client_ts timestamptz not null
utm jsonb
result jsonb
status text not null default 'received'
created_at timestamptz not null default now()

-- public.events
id uuid PK default gen_random_uuid()
response_id uuid references public.responses(id) on delete set null
type text not null  -- page_view | quiz_start | quiz_submit | recommendation_shown | cta_click
meta jsonb
created_at timestamptz not null default now()
```
Notes:
- Configure RLS to allow inserts from anon (and optional select on your own dashboard). The site only calls insert/update.
- Ensure your n8n webhook includes CORS headers allowing this origin.

## Test & Simulation
- In the README panel (toggle from footer), click:
  - Simulate Webhook Success — injects a sample response and renders results
  - Simulate Webhook Fail — shows fallback and sets status=pending (if response row exists)

## ENV & Analytics
- GA and Meta Pixel are loaded only if IDs are set in ENV. PageView and quiz_submit are tracked; additional custom events are sent for quiz_start, recommendation_shown, and cta_click.

## Not Yet Implemented
- Deep-link restore by rid parameter (copy link includes rid but page does not auto-load past result)
- Email sending is handled server-side by your n8n flow (frontend only stores email if checkbox checked)

## Recommended Next Steps
- Add result deep-link loading by rid
- Add more metadata to events (e.g., step timings)
- Harden RLS policies and set specific insert policies
- Add loading indicators
- Optional: persist category/q3_value into responses if you want more verbose analytics

## Public URLs
- Website: after publishing (see Publish tab)
- API endpoints:
  - Supabase REST (managed by library)
  - Webhook: N8N_WEBHOOK_URL

## Project Goals & Main Features
- Help users pick top AI models in ~30 seconds
- Leverage Arena-backed data via n8n webhook
- Track basic funnel analytics

Deployment
To deploy your website and make it live, please go to the Publish tab where you can publish your project with one click. The Publish tab will handle all deployment processes automatically and provide you with the live website URL.
