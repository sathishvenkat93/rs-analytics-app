# RS Analytics

Upload a spreadsheet, choose the columns to plot, and build a dashboard of chart widgets you can rearrange by dragging.

## Run it

```bash
npm install
cp .env.example .env   # then fill in your Amazon Bedrock settings
npm run dev            # http://localhost:5173 (app + AI API)
npm run build          # type-check + production build into dist/
npm start              # serves dist/ and the AI API on http://localhost:8787
```

## AI features (Amazon Bedrock)

AI renaming, chart suggestions, generated dashboards, the chart chat and SQL writing call Claude through Claude in Amazon Bedrock. Settings live in `.env` and are read only by the server, so credentials never reach the browser. See `.env.example` for every option:

- `AWS_REGION` and `BEDROCK_MODEL_ID` (default `anthropic.claude-opus-5-5`; enable model access in the Bedrock console first).
- Credentials: `AWS_BEARER_TOKEN_BEDROCK`, or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`, or `AWS_PROFILE`, or the default AWS credential chain.
- `AI_PROVIDER=mock` runs offline heuristics for development; `AI_PROVIDER=off` hides AI features.

Only column names, types, summary stats and a few sample rows are sent to the model, never full datasets.

Stack: React 18, TypeScript, Vite, Recharts, dnd-kit, PapaParse, SheetJS, sql.js, d3-geo (maps), Anthropic Bedrock SDK.
