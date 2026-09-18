# Chrometry Pro release setup

Chrometry now has a free local tier and a paid Pro tier.

## Free
- Local CIELAB palette extraction
- Pixel sampling
- Local semantic roles
- JSON/CSS/Three.js exports

## Pro
- Stripe subscription
- Server-verified Pro license
- Server-side OpenAI vision
- Game/scene identification and rendering reconstruction
- Public technical research through the OpenAI Responses API web-search tool

## Deploy
Deploy the repository to Vercel and configure the variables in .env.example. Create recurring Stripe prices first; the app never hard-codes the amount.

For the hosted web app, the API is relative when deployed on Vercel. For GitHub Pages or the bundled extension, set `window.CHROMETRY_API_BASE_URL` to the Vercel API origin before `monetization.js` loads.

## Stripe
Create a recurring Pro product and monthly/annual prices. Enable Stripe Customer Portal. Checkout returns to Chrometry with a Checkout Session ID; /api/activate verifies it with Stripe and creates a short-lived signed license token.

## Chrome Web Store
Load the repository root as an unpacked extension from chrome://extensions. Test free analysis, checkout, activation, Pro AI, expired/canceled subscription behavior and billing management. Before submission, replace the broad Vercel host permission with the exact production API origin and publish a privacy policy/support URL. Clearly identify Chrometry as the seller of the subscription.
