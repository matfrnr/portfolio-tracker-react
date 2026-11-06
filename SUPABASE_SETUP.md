# Supabase setup and privacy

The app uses Supabase Auth with email/password and Postgres directly from the browser. Portfolio tables have Row Level Security (RLS) policies that only allow the signed-in user to access rows whose `user_id` matches their Supabase identity. New accounts start with an empty portfolio. Vercel deploys the Vite frontend from `client/` and the Express API from `server/`; `/` routes to the frontend and `/api/*` to the API.

## 1. Create the database tables

In the Supabase project SQL Editor, run `supabase/migrations/20261106000000_portfolio_rls.sql`. The migration creates the transaction, price, and settings tables, enables RLS, grants access only to authenticated users, and adds an atomic import function.

Do not disable RLS for these tables. Do not add policies that allow `anon` access.

## 2. Configure email/password sign-in

In Supabase Authentication settings, enable the Email provider. Keep email confirmation enabled for public sign-ups and configure custom SMTP if users outside your Supabase organization need confirmation emails. Add the Vercel production URL to Supabase's allowed redirect URLs. Add preview URLs only if you intend to sign in from preview deployments.

## 3. Configure Vercel

Copy `client/.env.example` values into Vercel Project Settings → Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL` if the public market-data API is hosted at a separate origin

The publishable key is intentionally included in browser code; RLS is what protects the data. Never put a database password, Supabase secret key, or legacy `service_role` key in a `VITE_` variable, source file, or GitHub. The app does not need a database connection string in Vercel's frontend environment.

In Vercel, import the repository root so the `services` configuration in `vercel.json` is used. The legacy Express transaction and manual-price routes are disabled in production; portfolio data is accessed from Supabase under RLS.

## 4. Keep private portfolio files out of Git

The repository ignores `.env` files, SQLite databases, `server/data/portfolio-data.json`, and `trade-republic-import.csv`. Keep exports and broker statements outside the repository. If a secret was ever committed, removing it in a later commit is not enough: rotate that secret and remove it from Git history before publishing the repository.

## 5. Move the existing portfolio

Before enabling cloud mode, export a JSON backup from the local app and keep a second copy outside the project. Create or sign in to your email/password account in the deployed app, then use **Importer** to import that backup. Imports are explicit; the app never copies one browser's local cache into a newly created account automatically.

## 6. Verify isolation before using real data

Create two test accounts. Add a test transaction while signed in as the first user. Sign in as the second user and confirm that the transaction list is empty. Try a direct read in the Supabase API as the second user and confirm the first user's row is not returned. Then sign back into the first account and verify its transaction is still present.

For backups, keep regular JSON exports outside the repository. Check the backup retention for the Supabase plan you select; do not assume a free project has the same automated backup retention as paid plans.
