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


## Free-tier ads

The free plan now has a clearly labeled native **Sponsored** placement. Pro users do not receive the ad slot.

The extension does **not** use Google AdSense. Google states that AdSense ads may not be distributed through software applications such as browser extensions. citeturn0search0turn0search8

For real ad revenue, connect the slot to an extension-compatible advertising partner or sell direct sponsorships. Current extension-specific networks include ExtAds and AdsOnBread; both advertise native placements designed for browser extensions, but you should review their contracts, privacy requirements, payout terms, and Chrome Web Store compliance yourself before going live. citeturn1search8turn1search10

The current implementation intentionally keeps the ad interface provider-neutral. Set the sponsor variables in .env for a direct sponsor, or replace the /api/ads response with the approved provider's local SDK/API integration.

Recommended placement: one small sponsor card near the workspace/sidebar, never a pop-up, redirect, injected page ad, or UI element that could be mistaken for a control.
