# Chrometry Pro + AdSense release setup

## Product model

### Chrome extension
- Free to download.
- Local colorimetry remains useful without a subscription.
- Pro unlocks server-backed Scene Look AI and premium analysis.
- Google AdSense is not loaded in the extension. Google prohibits AdSense distribution through software applications such as browser extensions.
- The extension can send users to the full free web version as an auxiliary feature.

### Website
- Full local analyzer is free.
- Free web usage can show Google AdSense after Google approves the site.
- Pro users get AI and an ad-free web session.
- Privacy, Terms, and Contact pages are included.

## AdSense setup

1. Create/sign in to Google AdSense.
2. Add the production website under Sites.
3. Complete payment information and any requested tax information.
4. Connect the site using the exact AdSense code/meta method Google provides.
5. Wait for the site review. Google says this can take a few days and sometimes 2–4 weeks.
6. Configure Privacy & messaging for applicable regions.
7. After approval, put your public ca-pub-... publisher ID in adsense-config.js.
8. Add the exact ads.txt line Google gives you at the root of the production site.
9. Test the site. Never click your own ads and never encourage visitors to click them.

The repository intentionally leaves the publisher ID blank until approval. adsense.js only loads on normal HTTP/HTTPS web pages and only when the publisher ID is valid.

## Stripe Pro

Create a Stripe product named Chrometry Pro and recurring monthly and optional annual prices. Enable Stripe Customer Portal.

Keep STRIPE_SECRET_KEY server-side. Never put Stripe secret keys or the OpenAI API key into the extension.

## Pro unlock flow

1. User installs the extension.
2. User can use the local analyzer; AI is clearly marked Pro.
3. User selects Upgrade to Pro.
4. The extension calls /api/checkout.
5. Stripe Checkout creates the recurring subscription.
6. Stripe redirects to the website with checkout_session_id.
7. /api/activate retrieves the Checkout Session server-side and verifies the subscription is a Chrometry Pro subscription with active/trialing status.
8. The website stores the signed activation token and can display it.
9. If purchase began in the extension, the customer copies that activation token into Activate existing Pro in the extension.
10. /api/verify checks the signed token and retrieves the live Stripe subscription. Active subscriptions also receive a refreshed signed token.
11. /api/ai requires the same verified Pro entitlement.
12. /api/portal opens Stripe's short-lived Customer Portal session.

## Chrome Web Store

Register a Chrome Web Store developer account and pay Google's one-time registration fee. The account requires a publisher name and verified email. Extensions that offer purchases/additional features/subscriptions must include a physical address in the developer account.

The listing must clearly state:
- Free download.
- Local analyzer included.
- Chrometry Pro is a paid subscription for AI/premium features.
- Full free web version available.
- Privacy/support links.

Use minimum permissions. Before production submission, replace the placeholder host permission in manifest.json with your exact API hostname.

## Production variables

Server/Vercel:
- STRIPE_SECRET_KEY
- STRIPE_PRICE_PRO_MONTHLY
- STRIPE_PRICE_PRO_ANNUAL
- CHROMETRY_LICENSE_SECRET
- CHROMETRY_APP_URL
- OPENAI_API_KEY
- OPENAI_MODEL

Public:
- CHROMETRY_API_BASE_URL
- CHROMETRY_WEB_URL
- CHROMETRY_ADSENSE_PUBLISHER_ID

Never commit secrets.

## Release order

1. Deploy the website/API.
2. Create/test Stripe prices.
3. Enable Stripe Customer Portal.
4. Configure Vercel secrets.
5. Test purchase → activation token → extension unlock → cancellation.
6. Create/verify AdSense account and submit the website.
7. After approval, add the publisher ID and exact ads.txt line Google supplies.
8. Register Chrome Web Store developer account.
9. Upload the extension ZIP and complete privacy/data disclosures.
10. Submit for review.