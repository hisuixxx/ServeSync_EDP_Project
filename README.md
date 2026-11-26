# ServeSync E-Commerce

## Checkout, payment methods, and GCash setup

The project uses Node.js, Express, Sequelize, and MySQL. Configure the environment before deploying:

1. Copy `.env.example` to `.env`.
2. Set `APP_URL` to the deployed public HTTPS address, a long random `SESSION_SECRET`, and the MySQL credentials. `TRUST_PROXY` defaults to one trusted proxy in production; adjust it to match the actual reverse-proxy topology.
3. Configure SMTP with `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, `MAIL_ENCRYPTION=tls`, the administrator-controlled Gmail `MAIL_USERNAME`, a Google App Password in `MAIL_PASSWORD`, and `MAIL_FROM_ADDRESS` set to that account. `MAIL_FROM_NAME` defaults to **ServeSync Restaurant**. Never commit `.env` or expose credentials in frontend code.
4. To enable Google sign-in, create a **Web application** OAuth client in Google Cloud Console, enable the Google identity/OpenID Connect scopes, add the deployed callback URL `https://your-domain/auth/google/callback` to **Authorized redirect URIs**, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`. The redirect URI must exactly match the Google Console value. OAuth uses state and PKCE; Google email must be verified. New Google users receive the customer role, and verified Google accounts can be linked to an existing account with the same email.
5. The supplied QR is installed as `storage/payment-assets/servesync-gcash.png` and is used by default. `GCASH_ACCOUNT_NAME` defaults to **ServeSync Gcash**; a GCash number is optional when using the QR. The admin can replace the account details under **Menu → Storefront Control → Restaurant GCash account**.
6. Install dependencies with `npm install`, then run `npm run migrate` to synchronize the Google identity, email verification cooldown, GCash settings, and payment method columns without dropping existing tables or rows. Review the migration output before deploying.
7. Start the server with `npm start`.

If the configured port is already in use, the server tries the next 10 ports and logs the address it selected. Set `PORT` to a specific available port if you do not want this fallback.

Password-based registrations receive a verification link that expires after 24 hours. Checkout is blocked until the registered email is verified; the checkout modal and profile provide a resend action with a 60-second cooldown. Google sign-ins with Google-verified email addresses are marked verified. Verification links use `APP_URL`, which must be the deployed HTTPS origin in production.

Customers can choose Cash on Delivery or GCash at checkout. Cash on Delivery orders do not need a GCash account, QR code, or transaction reference; administrators can approve the order and mark the cash payment collected later. GCash orders require a transaction reference and administrator verification before approval.

The checkout shows aligned product, quantity, unit-price, and subtotal columns, plus the total and delivery fee. For GCash, the configured account details and QR code are shown with the exact transfer amount. GCash payments and all orders start pending; an administrator must review GCash payments. Uploaded payment receipts and QR images are held under `storage/payment-receipts` and `storage/payment-assets`, respectively; persist these directories and restrict filesystem access in production. Receipts and QR images are served through authenticated routes.

Verification, itemized order-confirmation, and payment notification emails are sent to the customer's registered address when SMTP is configured. If order-email delivery fails, the order remains placed and the customer sees a separate delivery warning; failures are also logged. Configure reliable application logging and monitor those messages for delivery issues. A real email delivery or Google sign-in cannot be confirmed until valid SMTP/OAuth credentials and reachable external accounts are configured.

## Validation

Run the checkout/payment checks with:

```sh
node tests/validate-checkout.js
```

The existing service-request check is:

```sh
node tests/validate-requests.js
```

That existing test expects `views/catering-request.xian`, which is not present in the current repository snapshot, so it cannot pass without restoring that unrelated view.
