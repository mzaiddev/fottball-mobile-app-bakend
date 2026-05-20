# Project Baller Backend

Production-style Node.js, Express, and MongoDB backend for the Project Baller mobile app and admin dashboard.

## What is included

- JWT auth with user roles: `owner`, `admin`, `coach`, `moderator`, `support`, `user`
- Onboarding profile storage, referral capture, and wearable connection flags
- Weekly AI plan generation with admin review queue and usage caps
- Workout logging, progress tracking, and readiness score recalculation
- Nutrition targets, daily log, hydration tracking, recipe library, and meal-plan generation
- Match scheduling, matchday hub, post-match logging, and plan auto-adjustments
- Community feed, likes, comments, direct-message threads
- Admin APIs for rules, exercises, recipes, rehab protocols, subscriptions, and support tickets
- Cloudinary upload endpoint
- Stripe checkout endpoint and RevenueCat / Stripe webhook handlers
- Daily cron job for backup readiness recalculation

## Stack

- Node.js
- Express
- MongoDB + Mongoose
- OpenAI API
- Cloudinary
- Stripe
- Socket.IO

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy envs:

```bash
cp .env.example .env
```

3. Fill in the required values in `.env`

4. Start the API:

```bash
npm run dev
```

5. Health check:

```bash
GET /health
```

## Important env vars

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `OPENAI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REVENUECAT_WEBHOOK_SECRET`

## Main API groups

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users/dashboard`
- `PATCH /api/users/onboarding`
- `GET /api/users/referrals`
- `POST /api/plans/generate`
- `POST /api/plans/regenerate`
- `GET /api/plans/current`
- `POST /api/plans/workouts/log`
- `GET /api/plans/insights`
- `POST /api/plans/ai-chat`
- `GET /api/plans/library/exercises`
- `GET /api/nutrition/today`
- `POST /api/nutrition/meals`
- `POST /api/nutrition/hydration`
- `POST /api/nutrition/generate-meal-plan`
- `POST /api/matches`
- `GET /api/matches`
- `GET /api/matches/history`
- `GET /api/matches/:id/hub`
- `POST /api/matches/:id/performance`
- `POST /api/community/posts`
- `GET /api/community/posts`
- `POST /api/community/threads`
- `POST /api/integrations/checkout`
- `POST /api/integrations/upload`
- `GET /api/admin/dashboard`

## Notes

- OpenAI is server-side only. The client never receives the API key.
- Plan generation falls back to deterministic templates if OpenAI is unavailable.
- Rehab is template-driven and locked by protocol, matching your requirement that AI does not prescribe rehab.
- Match readiness score is recalculated from training load, recovery, match timing, and nutrition/hydration.
- The admin dashboard frontend can now consume these APIs directly.
