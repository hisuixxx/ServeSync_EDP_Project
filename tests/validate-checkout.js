import assert from "node:assert/strict";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startServer } from "../index.js";
import { placeCheckoutOrder, checkoutPage } from "../controllers/checkoutcontroller.js";
import { googleCallback, googleSignIn, registerUser } from "../controllers/authController.js";
import { verifyEmail } from "../controllers/emailverificationcontroller.js";
import { customerOrderDetail } from "../controllers/customerordercontroller.js";
import { User } from "../models/userModel.js";
import { Cart, Order, OrderItem, Payment, Product, Auditlog, Notification } from "../models/associations.js";
import { getStorefrontSettings, StorefrontSetting } from "../models/StorefrontSetting.js";
import { sequelize } from "../models/db.js";
import { requireRole } from "../middleware/auth.js";
import { issueVerificationEmail, verificationTokenHash } from "../utils/emailverification.js";
import { getConfiguredGcashQr } from "../utils/gcash.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const syntaxFiles = [
  "controllers/checkoutcontroller.js",
  "controllers/authController.js",
  "controllers/cartController.js",
  "controllers/emailverificationcontroller.js",
  "controllers/profileController.js",
  "controllers/customerordercontroller.js",
  "controllers/ordermanagementcontroller.js",
  "controllers/storefrontcontroller.js",
  "controllers/staffcontroller.js",
  "middleware/upload.js",
  "models/StorefrontSetting.js",
  "models/userModel.js",
  "routes/index.js",
  "utils/emailverification.js",
  "utils/gcash.js",
  "utils/mailer.js",
];
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
}

const handlebars = (await import("hbs")).default.handlebars;
handlebars.registerHelper("eq", (left, right) => left === right);
for (const partial of ["head", "footer", "admin-sidebar", "admin-topbar", "flash-messages"]) {
  handlebars.registerPartial(partial, "");
}
const cartTemplate = handlebars.compile(readFileSync(`${root}/views/customer/cart.xian`, "utf8"));
const loginTemplate = handlebars.compile(readFileSync(`${root}/views/login.xian`, "utf8"));
const registerTemplate = handlebars.compile(readFileSync(`${root}/views/register.xian`, "utf8"));
const profileTemplate = handlebars.compile(readFileSync(`${root}/views/customer/profile.xian`, "utf8"));
const adminRequestsTemplate = handlebars.compile(readFileSync(`${root}/views/admin/admin-requests.xian`, "utf8"));
for (const file of [
  "views/admin/categories.xian",
  "views/admin/orders.xian",
  "views/admin/products.xian",
  "views/staff/products.xian",
  "views/staff/staff-requests.xian",
]) {
  handlebars.compile(readFileSync(`${root}/${file}`, "utf8"));
}
for (const template of [loginTemplate, registerTemplate]) {
  const html = template({ googleConfigured: true });
  assert.match(html, /Continue with Google/);
  assert.match(html, /servesync-google-mark/);
}
assert.match(profileTemplate({ user: { email_verified_at: null } }), /Resend Verification Email/);
const terminalRequestHtml = adminRequestsTemplate({
  isCatering: true,
  adminPageTitle: "Catering requests",
  requests: [{
    id: 14,
    requestType: "Catering",
    isCatering: true,
    customer_name: "Customer",
    status: "completed",
    canUpdateStatus: false,
    statusOptions: [],
  }],
});
assert.match(terminalRequestHtml, /View details/);
assert.match(terminalRequestHtml, /This request is completed and can no longer be changed/);
assert.doesNotMatch(terminalRequestHtml, /servesync-request-status-form/);
assert.doesNotMatch(terminalRequestHtml, />(?:true|false)</);
const activeRequestHtml = adminRequestsTemplate({
  isCatering: true,
  adminPageTitle: "Catering requests",
  requests: [{
    id: 15,
    requestType: "Catering",
    isCatering: true,
    customer_name: "Customer",
    status: "pending",
    canUpdateStatus: true,
    statusOptions: [{ value: "pending", isSelected: true }, { value: "approved", isSelected: false }],
  }],
});
assert.match(activeRequestHtml, /View \/ update/);
assert.match(activeRequestHtml, /servesync-request-status-form/);
assert.doesNotMatch(activeRequestHtml, />(?:true|false)</);
const cartHtml = cartTemplate({
  cart: [{ id: 2, product_name: "Meal", quantity: 2, price: "10.00", lineTotal: "20.00", canDecrease: true, isAvailable: true }],
  cartTotal: "20.00",
  cartTotalFormatted: "₱20.00",
  canCheckout: true,
  checkoutOpen: true,
  paymentConfigured: true,
  currentUser: { full_name: "Customer", email: "customer@example.com", phone: "09171234567" },
  emailVerified: true,
  gcashName: "ServeSync Restaurant",
  gcashNumber: "09170000000",
  gcashQr: "/payments/gcash-qr",
});
for (const expected of ["Proceed to Buy", "checkout-modal", "customer@example.com", "Verified", "Product", "Unit price", "Subtotal", "Total amount to pay", "09170000000", "Copy number", "Download QR code", "delivery_address", "reference_code", "receiptFile", "acceptTerms", "data-payment-choice=\"cash_on_delivery\"", "data-payment-choice=\"gcash\"", "name=\"payment_method\"", "data-gcash-payment"]) {
  assert.ok(cartHtml.includes(expected), `Checkout modal must include ${expected}.`);
}
assert.doesNotMatch(cartHtml, /name="email"/, "Checkout must use the authenticated account email rather than accept another address.");
assert.match(cartHtml, /payment remains pending until an administrator verifies it/i);
assert.match(cartHtml, /₱20\.00/);
assert.doesNotMatch(cartHtml, /Not verified|Resend Verification Email|data-checkout-submit[^>]*disabled/i);
const unverifiedCartHtml = cartTemplate({
  cart: [{ id: 2, product_name: "Meal", quantity: 1, price: "10.00", lineTotal: "10.00", canDecrease: true, isAvailable: true }],
  cartTotal: "10.00",
  canCheckout: true,
  emailVerified: false,
  currentUser: { full_name: "Customer", email: "customer@example.com" },
});
assert.match(unverifiedCartHtml, /Not verified/);
assert.match(unverifiedCartHtml, /Resend Verification Email/);
assert.match(unverifiedCartHtml, /data-checkout-submit[^>]*disabled/);
assert.match(unverifiedCartHtml, /checkout-verification-required/);
const noGcashHtml = cartTemplate({
  cart: [{ id: 2, product_name: "Meal", quantity: 1, lineTotal: "10.00", canDecrease: true, isAvailable: true }],
  cartTotal: "10.00",
  paymentConfigured: false,
});
assert.match(noGcashHtml, /data-payment-choice="cash_on_delivery"/);
assert.match(noGcashHtml, /data-payment-choice="gcash"[^>]*disabled/);
assert.doesNotMatch(cartHtml, /<select[^>]+name="payment_method"/);

assert.deepEqual(Payment.rawAttributes.method.type.values, ["gcash", "cash_on_delivery"]);
assert.equal(Payment.rawAttributes.reference_code.allowNull, true);
assert.deepEqual(Payment.rawAttributes.status.type.values, ["pending", "verified", "rejected"]);
assert.equal(Payment.rawAttributes.status.defaultValue, "pending");
assert.ok(User.rawAttributes.email_verified_at);
assert.equal(User.rawAttributes.email_verification_sent_at.allowNull, true);
assert.equal(User.rawAttributes.google_id.unique, true);
const previousGcashQr = process.env.GCASH_QR_IMAGE;
delete process.env.GCASH_QR_IMAGE;
assert.equal(await getConfiguredGcashQr({ gcash_qr_image: "missing-test-qr.png" }), "servesync-gcash.png");
assert.equal(await getConfiguredGcashQr({ gcash_qr_image: "servesync-gcash.png" }), "servesync-gcash.png");
if (previousGcashQr === undefined) delete process.env.GCASH_QR_IMAGE;
else process.env.GCASH_QR_IMAGE = previousGcashQr;

const originals = {
  transaction: sequelize.transaction,
  userFindByPk: User.findByPk,
  userFindOne: User.findOne,
  userCreate: User.create,
  orderFindOne: Order.findOne,
  storefrontFindByPk: StorefrontSetting.findByPk,
  cartFindOne: Cart.findOne,
  cartCreate: Cart.create,
  productFindOne: Product.findOne,
  orderCreate: Order.create,
  orderItemBulkCreate: OrderItem.bulkCreate,
  paymentFindOne: Payment.findOne,
  paymentCreate: Payment.create,
  auditlogCreate: Auditlog.create,
  notificationCreate: Notification.create,
};
try {
  const previousGcashQr = process.env.GCASH_QR_IMAGE;
  delete process.env.GCASH_QR_IMAGE;
  StorefrontSetting.findByPk = async () => ({
    get: () => ({ gcash_account_name: "ServeSync Restaurant", gcash_qr_image: "missing-test-qr.png" }),
  });
  const defaultGcashSettings = await getStorefrontSettings();
  assert.equal(defaultGcashSettings.gcash_account_name, "ServeSync Gcash");
  assert.equal(await getConfiguredGcashQr(defaultGcashSettings), "servesync-gcash.png");
  if (previousGcashQr === undefined) delete process.env.GCASH_QR_IMAGE;
  else process.env.GCASH_QR_IMAGE = previousGcashQr;
  StorefrontSetting.findByPk = originals.storefrontFindByPk;

  let transactionCount = 0;
  sequelize.transaction = async () => {
    transactionCount += 1;
    throw new Error("Checkout validation should not start a transaction.");
  };
  const makeRequest = (overrides = {}) => ({
    body: {
      order_type: "pickup",
      contact_number: "09171234567",
      payment_method: "gcash",
      reference_code: "ABC123456",
      acceptTerms: "1",
      ...overrides,
    },
    user: { id: 7, email_verified_at: new Date() },
    flash(type, message) {
      this.messages = [...(this.messages || []), { type, message }];
      this.message = { type, message };
    },
  });
  const redirectResponse = () => ({
    redirect(path) { this.location = path; },
  });

  const googleSettings = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
  const previousGoogleSettings = Object.fromEntries(googleSettings.map(key => [key, process.env[key]]));
  googleSettings.forEach(key => { process.env[key] = ""; });
  const googleStartRequest = {
    query: { source: "register" },
    session: {},
    flash(type, message) { this.message = { type, message }; },
  };
  const googleStartResponse = redirectResponse();
  googleSignIn(googleStartRequest, googleStartResponse);
  assert.equal(googleStartResponse.location, "/register", "Unconfigured Google sign-in should return to registration with an explicit message.");
  assert.match(googleStartRequest.message.message, /not configured/i);
  googleSettings.forEach(key => {
    if (previousGoogleSettings[key] === undefined) delete process.env[key];
    else process.env[key] = previousGoogleSettings[key];
  });

  const previousGoogleEnv = {
    nodeEnv: process.env.NODE_ENV,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  };
  const originalFetch = globalThis.fetch;
  process.env.NODE_ENV = "test";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://servesync.example/auth/google/callback";
  const oauthStartRequest = {
    query: { source: "register" },
    session: { returnTo: "/cart?checkout=1" },
  };
  const oauthStartResponse = redirectResponse();
  googleSignIn(oauthStartRequest, oauthStartResponse);
  const authorizationUrl = new URL(oauthStartResponse.location);
  assert.equal(authorizationUrl.origin, "https://accounts.google.com");
  assert.equal(authorizationUrl.searchParams.get("state"), oauthStartRequest.session.googleOAuth.state);
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorizationUrl.searchParams.get("scope"), "openid email profile");
  let tokenRequestBody;

  const googleUserInfo = {
    sub: "google-sub-27",
    email: "google-customer@gmail.com",
    email_verified: true,
    name: "Google Customer",
  };
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/token")) tokenRequestBody = String(options.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return String(url).includes("/token") ? { access_token: "mock-access-token" } : googleUserInfo;
      },
    };
  };
  User.findOne = async () => null;
  let googleCreatedValues;
  User.create = async values => {
    googleCreatedValues = values;
    return { id: 27, role: values.role };
  };
  const googleCallbackRequest = {
    query: { state: oauthStartRequest.session.googleOAuth.state, code: "mock-auth-code" },
    session: {
      googleOAuth: oauthStartRequest.session.googleOAuth,
      regenerate(callback) { callback(null); },
    },
    flash(type, message) { this.message = { type, message }; },
  };
  const googleCallbackResponse = redirectResponse();
  await googleCallback(googleCallbackRequest, googleCallbackResponse);
  assert.equal(googleCreatedValues.google_id, "google-sub-27");
  assert.equal(googleCreatedValues.email_verified_at instanceof Date, true);
  assert.equal(googleCreatedValues.role, "customer");
  assert.match(tokenRequestBody, /code_verifier=/, "The authorization-code exchange must include the PKCE verifier.");
  assert.equal(googleCallbackRequest.session.userId, 27);
  assert.equal(googleCallbackResponse.location, "/cart?checkout=1");

  const existingGoogleAccount = {
    id: 28,
    email: "admin@example.com",
    role: "admin",
    status: "active",
    google_id: null,
    email_verified_at: null,
    async update(values) { Object.assign(this, values); },
  };
  globalThis.fetch = async url => ({
    ok: true,
    status: 200,
    async json() {
      return String(url).includes("/token") ? { access_token: "mock-access-token" } : {
        sub: "google-sub-admin",
        email: "admin@example.com",
        email_verified: true,
        name: "Existing Admin",
      };
    },
  });
  User.findOne = async options => options.where.google_id ? null : existingGoogleAccount;
  User.create = async () => { throw new Error("An existing account must be linked instead of duplicated."); };
  const linkedGoogleRequest = {
    query: { state: "linked-state", code: "mock-auth-code" },
    session: {
      googleOAuth: { state: "linked-state", verifier: "verifier", source: "login", returnTo: "" },
      regenerate(callback) { callback(null); },
    },
    flash() {},
  };
  const linkedGoogleResponse = redirectResponse();
  await googleCallback(linkedGoogleRequest, linkedGoogleResponse);
  assert.equal(existingGoogleAccount.google_id, "google-sub-admin");
  assert.equal(existingGoogleAccount.email_verified_at instanceof Date, true);
  assert.equal(linkedGoogleRequest.session.userRole, "admin", "Linking Google must preserve the existing user role.");
  assert.equal(linkedGoogleResponse.location, "/dashboard");

  globalThis.fetch = originalFetch;
  if (previousGoogleEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousGoogleEnv.nodeEnv;
  if (previousGoogleEnv.clientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = previousGoogleEnv.clientId;
  if (previousGoogleEnv.clientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = previousGoogleEnv.clientSecret;
  if (previousGoogleEnv.redirectUri === undefined) delete process.env.GOOGLE_REDIRECT_URI;
  else process.env.GOOGLE_REDIRECT_URI = previousGoogleEnv.redirectUri;

  const unverifiedRequest = makeRequest();
  unverifiedRequest.user.email_verified_at = null;
  const unverifiedResponse = redirectResponse();
  await placeCheckoutOrder(unverifiedRequest, unverifiedResponse);
  assert.match(unverifiedRequest.message.message, /verify your registered email/i);
  assert.equal(unverifiedResponse.location, "/cart?checkout=1");
  assert.equal(transactionCount, 0, "Unverified customers must be rejected before checkout starts.");

  const previousVerificationUrl = process.env.APP_URL;
  const previousVerificationNodeEnv = process.env.NODE_ENV;
  process.env.APP_URL = "";
  process.env.NODE_ENV = "production";
  const missingProductionUrl = await issueVerificationEmail({ id: 99 });
  assert.equal(missingProductionUrl.reason, "invalid_app_url", "Production verification links must not fall back to localhost.");
  assert.equal(transactionCount, 0);
  if (previousVerificationUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousVerificationUrl;
  if (previousVerificationNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousVerificationNodeEnv;

  const mailSettingsForRegistration = ["MAIL_MAILER", "MAIL_HOST", "MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_FROM_ADDRESS"];
  const previousMailSettingsForRegistration = Object.fromEntries(mailSettingsForRegistration.map(key => [key, process.env[key]]));
  mailSettingsForRegistration.forEach(key => { process.env[key] = ""; });
  const previousAppUrl = process.env.APP_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.APP_URL = "https://servesync.example";
  process.env.NODE_ENV = "test";
  const originalConsoleError = console.error;
  let verificationEmailAttempted = false;
  console.error = (...args) => {
    if (String(args[0]).includes("email_verification")) verificationEmailAttempted = true;
  };
  const previousValidationTransaction = sequelize.transaction;
  const lockedRegistrationUser = {
    id: 26,
    email: "new-customer@gmail.com",
    full_name: "New Customer",
    email_verified_at: null,
    email_verification_sent_at: null,
    async update(values) { Object.assign(this, values); },
  };
  sequelize.transaction = async () => ({
    LOCK: { UPDATE: "UPDATE" },
    finished: undefined,
    async rollback() { this.finished = "rollback"; },
    async commit() { this.finished = "commit"; },
  });
  User.findByPk = async () => lockedRegistrationUser;
  User.findOne = async () => null;
  let registeredValues;
  User.create = async values => {
    registeredValues = values;
    return { id: 26, email: values.email };
  };
  const registrationRequest = {
    body: {
      name: "New Customer",
      email: "new-customer@gmail.com",
      password: "Asecurepassword123",
      confirmPassword: "Asecurepassword123",
    },
    session: { regenerate(callback) { callback(null); } },
    flash(type, message) { this.message = { type, message }; },
  };
  const registrationResponse = redirectResponse();
  try {
    await registerUser(registrationRequest, registrationResponse);
    const cooldown = await issueVerificationEmail({ id: 26 });
    assert.equal(cooldown.reason, "cooldown");
    assert.ok(cooldown.cooldownSeconds > 0 && cooldown.cooldownSeconds <= 60);
  } finally {
    console.error = originalConsoleError;
    sequelize.transaction = previousValidationTransaction;
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    mailSettingsForRegistration.forEach(key => {
      if (previousMailSettingsForRegistration[key] === undefined) delete process.env[key];
      else process.env[key] = previousMailSettingsForRegistration[key];
    });
  }
  assert.equal(registeredValues.email, "new-customer@gmail.com");
  assert.equal(verificationEmailAttempted, true, "Creating an account must attempt to send an email verification message.");
  assert.equal(lockedRegistrationUser.email_verification_token_hash.length, 64);
  assert.match(registrationRequest.message.message, /verification email was not sent/i);
  assert.equal(registrationResponse.location, "/dashboard", "Email delivery failure must not undo account creation.");

  const invalidDelivery = makeRequest({ order_type: "delivery", delivery_address: "short" });
  const invalidDeliveryResponse = redirectResponse();
  await placeCheckoutOrder(invalidDelivery, invalidDeliveryResponse);
  assert.match(invalidDelivery.message.message, /delivery address/i);
  assert.equal(transactionCount, 0);

  const missingTerms = makeRequest({ acceptTerms: "" });
  const missingTermsResponse = redirectResponse();
  await placeCheckoutOrder(missingTerms, missingTermsResponse);
  assert.match(missingTerms.message.message, /accept the Terms/i);
  assert.equal(transactionCount, 0);

  const oversizedReference = makeRequest({ reference_code: "A".repeat(101) });
  await placeCheckoutOrder(oversizedReference, redirectResponse());
  assert.match(oversizedReference.message.message, /valid GCash reference/i);
  assert.equal(transactionCount, 0, "Overlong references must be rejected, not silently truncated.");

  const oversizedPhone = makeRequest({ contact_number: "1".repeat(31) });
  await placeCheckoutOrder(oversizedPhone, redirectResponse());
  assert.match(oversizedPhone.message.message, /valid contact number/i);
  assert.equal(transactionCount, 0);

  const invalidReference = makeRequest({ reference_code: "abc%$" });
  await placeCheckoutOrder(invalidReference, redirectResponse());
  assert.match(invalidReference.message.message, /valid GCash reference/i);
  assert.equal(transactionCount, 0);

  let staleEmailRollback = false;
  sequelize.transaction = async () => ({
    LOCK: { UPDATE: "UPDATE" },
    finished: undefined,
    async rollback() { staleEmailRollback = true; this.finished = "rollback"; },
    async commit() { this.finished = "commit"; },
  });
  User.findByPk = async () => ({ id: 7, status: "active", email_verified_at: null });
  const staleVerificationRequest = makeRequest({ payment_method: "cash_on_delivery", reference_code: "" });
  const staleVerificationResponse = redirectResponse();
  await placeCheckoutOrder(staleVerificationRequest, staleVerificationResponse);
  assert.match(staleVerificationRequest.message.message, /verify your registered email/i);
  assert.equal(staleEmailRollback, true, "Checkout must re-check email verification inside the transaction.");
  assert.equal(staleVerificationResponse.location, "/cart?checkout=1");

  let rolledBack = false;
  let committed = false;
  sequelize.transaction = async () => ({
    LOCK: { UPDATE: "UPDATE" },
    finished: undefined,
    async rollback() { rolledBack = true; this.finished = "rollback"; },
    async commit() { committed = true; this.finished = "commit"; },
  });
  let paymentValues;
  let notificationValues;
  const activeUnverifiedCustomer = { id: 7, status: "active", email: "customer@example.com", full_name: "Customer", email_verified_at: new Date() };
  User.findByPk = async () => activeUnverifiedCustomer;
  StorefrontSetting.findByPk = async () => ({
    get: () => ({ hidden_product_ids: [], featured_product_ids: [], featured_category_ids: [] }),
  });
  const cart = {
    items: [{ product_id: 8, quantity: 2, product: { product_name: "Meal" } }],
    async update() {},
  };
  Cart.findOne = async () => cart;
  Cart.create = async () => ({});
  Product.findOne = async () => ({ id: 8, product_name: "Meal", price: "10.00" });
  Order.create = async values => ({ id: 12, ...values, order_number: "SS-12", createdAt: new Date(), total_amount: values.total_amount });
  OrderItem.bulkCreate = async () => [];
  Payment.findOne = async () => { throw new Error("COD checkout must not check GCash reference duplicates."); };
  Payment.create = async values => { paymentValues = values; return { id: 13 }; };
  Auditlog.create = async () => ({});
  Notification.create = async values => { notificationValues = values; return {}; };
  const mailSettings = ["MAIL_MAILER", "MAIL_HOST", "MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_FROM_ADDRESS"];
  const previousMailSettings = Object.fromEntries(mailSettings.map(key => [key, process.env[key]]));
  mailSettings.forEach(key => { process.env[key] = ""; });
  const cashRequest = makeRequest({ payment_method: "cash_on_delivery", reference_code: "" });
  const cashResponse = redirectResponse();
  await placeCheckoutOrder(cashRequest, cashResponse);
  mailSettings.forEach(key => {
    if (previousMailSettings[key] === undefined) delete process.env[key];
    else process.env[key] = previousMailSettings[key];
  });
  assert.equal(cashResponse.location, "/my-orders/12", "Verified customers can submit Cash on Delivery orders.");
  assert.equal(paymentValues.method, "cash_on_delivery");
  assert.equal(paymentValues.reference_code, null);
  assert.ok(cashRequest.messages.some(message => message.type === "success_msg" && /Order SS-12 submitted/.test(message.message)));
  assert.ok(cashRequest.messages.some(message => message.type === "error_msg" && /confirmation email could not be sent/i.test(message.message)));
  assert.equal(notificationValues.user_id, 7);
  assert.match(notificationValues.message, /Cash on Delivery/);
  assert.equal(committed, true);
  assert.equal(rolledBack, false);

  const token = "a".repeat(64);
  const verifiedUser = {
    id: 7,
    email_verification_expires_at: new Date(Date.now() + 60_000),
    email_verification_sent_at: new Date(),
    async update(values) { Object.assign(this, values); },
  };
  User.findOne = async options => {
    assert.equal(options.where.email_verification_token_hash, verificationTokenHash(token));
    return verifiedUser;
  };
  const verifyRequest = { params: { token }, session: { userId: 7 }, flash() {} };
  const verifyResponse = redirectResponse();
  await verifyEmail(verifyRequest, verifyResponse);
  assert.ok(verifiedUser.email_verified_at instanceof Date);
  assert.equal(verifiedUser.email_verification_token_hash, null);
  assert.equal(verifiedUser.email_verification_sent_at, null);
  assert.equal(verifyResponse.location, "/cart?checkout=1", "Successful verification should return the customer to checkout.");

  let scopedCustomerId;
  Order.findOne = async options => {
    scopedCustomerId = options.where.customer_id;
    return null;
  };
  const forbiddenResponse = {
    status(code) { this.statusCode = code; return this; },
    send(message) { this.message = message; },
  };
  await customerOrderDetail({ params: { id: "12" }, user: { id: 99 } }, forbiddenResponse);
  assert.equal(scopedCustomerId, 99, "Customer order access must always be scoped to the logged-in user.");
  assert.equal(forbiddenResponse.statusCode, 404);

  let denied = false;
  requireRole("admin")[1](
    { user: { role: "customer" } },
    { status() { return this; }, render() { denied = true; } },
    () => assert.fail("A customer must not pass administrator authorization."),
  );
  assert.equal(denied, true);

  const checkout = redirectResponse();
  checkoutPage({}, checkout);
  assert.equal(checkout.location, "/cart?checkout=1");

  const occupiedServer = createServer();
  await new Promise((resolve, reject) => {
    occupiedServer.once("error", reject);
    occupiedServer.listen(0, "::", resolve);
  });
  let fallbackServer;
  try {
    fallbackServer = await startServer(occupiedServer.address().port);
    assert.ok(fallbackServer.address().port > occupiedServer.address().port);
  } finally {
    if (fallbackServer) await new Promise(resolve => fallbackServer.close(resolve));
    await new Promise(resolve => occupiedServer.close(resolve));
  }
} finally {
  sequelize.transaction = originals.transaction;
  User.findByPk = originals.userFindByPk;
  User.findOne = originals.userFindOne;
  User.create = originals.userCreate;
  Order.findOne = originals.orderFindOne;
  StorefrontSetting.findByPk = originals.storefrontFindByPk;
  Cart.findOne = originals.cartFindOne;
  Cart.create = originals.cartCreate;
  Product.findOne = originals.productFindOne;
  Order.create = originals.orderCreate;
  OrderItem.bulkCreate = originals.orderItemBulkCreate;
  Payment.findOne = originals.paymentFindOne;
  Payment.create = originals.paymentCreate;
  Auditlog.create = originals.auditlogCreate;
  Notification.create = originals.notificationCreate;
}

console.log("Checkout, payment and email-verification checks passed.");
