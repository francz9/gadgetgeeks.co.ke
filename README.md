# GadgetGeeks — deployment guide

A real, working online store: browsing, cart, and checkout via Paystack —
handling both card payments and M-Pesa mobile money through one provider.
No coding required for any step below.

## 1. Create your Paystack account
1. Go to https://paystack.com/signup and sign up — no registered business needed
   (you'll be a "Starter Business," which covers what you need to start selling).
2. In the dashboard, make sure you're in **Test mode** (toggle, top-right).
3. Go to **Settings → API Keys & Webhooks**. Copy the **Secret key**
   (starts with `sk_test_...`). Keep this private — never put it in the
   website files or share it publicly.

## 2. Put this project on GitHub
Upload every file in this folder to your `gadgetgeeks.co.ke` repo
(GitHub's "Add file → Upload files" button works — keep the `api/` folder intact).

## 3. Add Upstash Redis (tracks payment status between requests)
This is needed because M-Pesa payments confirm asynchronously — the
customer approves on their phone, then Paystack tells your site afterward.
1. Once your project is on Vercel (next step), go to **Storage → Create
   Database → Upstash Redis** and connect it.
2. Vercel automatically adds the required environment variables for you —
   nothing to copy.

## 4. Deploy to Vercel
1. Go to https://vercel.com, sign up with "Continue with GitHub."
2. Click **Add New → Project**, select `gadgetgeeks.co.ke`.
3. Before deploying, open **Environment Variables** and add:
   - Name: `PAYSTACK_SECRET_KEY`
   - Value: the `sk_test_...` key from step 1
4. Click **Deploy**. You'll have a live URL in about a minute.
5. Now go back and do step 3 (add Upstash Redis) if you haven't yet.

## 5. Connect the webhook (so payment status updates automatically)
1. In Paystack, go to **Settings → API Keys & Webhooks**.
2. Set the **Webhook URL** to: `https://YOUR-SITE.vercel.app/api/paystack-webhook`
   (use your real Vercel URL).
3. Save.

## 6. Test a real checkout (safely, in test mode)
**Card:**
1. Add a product, open the cart, leave **CARD** selected, enter any email, checkout.
2. Use test card `4084 0840 8408 4081`, any future expiry, CVC `408`, PIN `1234` — this is Paystack's documented test card as of this writing.
3. You should land back on your site with "Payment received," and see it under Paystack's **Transactions** tab.

**M-Pesa:**
1. Switch to **M-PESA**, enter an email and a test phone number.
2. Complete it per Paystack's current mobile money test instructions —
   check https://paystack.com/docs (search "test mobile money") since test
   numbers/PINs are updated periodically.

## 7. Go live with real payments
1. In Paystack, complete business verification under **Settings → Compliance**
   (this is how you actually get paid out — bank details required).
2. Switch to **Live mode**, copy the **live** secret key (`sk_live_...`).
3. In Vercel → your project → **Settings → Environment Variables**, replace
   `PAYSTACK_SECRET_KEY` with the live key, and redeploy.
4. Update the webhook URL in Paystack's live-mode settings too (each mode
   has its own webhook config).
5. Test with a small real transaction before announcing the store.

## Editing your products
Open `products.json` — a plain list. Edit directly on GitHub (click the
file, click the pencil icon) and Vercel redeploys automatically.

## What this does NOT include yet
- **Order fulfillment / inventory tracking** — payments are confirmed, but
  nothing yet emails you the order or reduces stock automatically.
- **Custom domain** — since you already have `gadgetgeeks.co.ke`, add it
  under Vercel → Project → Settings → Domains once deployed.
- **Shipping & delivery logistics** — not covered here; this is checkout only.

## A note on accuracy
Payment provider test cards, phone numbers, and exact API field names are
the kind of detail that changes over time. If anything in this README
doesn't match what you see on Paystack's dashboard, trust Paystack's
current docs (paystack.com/docs) over this file, and let me know what
changed so we can update the code.
