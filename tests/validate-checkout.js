import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cartController } from "../controllers/cartController.js";
import {
  Cart,
  CartItem,
  Product,
  Order,
  OrderItem,
  Payment,
} from "../models/associations.js";
import { sequelize } from "../models/db.js";
import { requireCustomer } from "../middleware/auth.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const javascriptFiles = [
  "controllers/cartController.js",
  "controllers/productcontroller.js",
  "controllers/authController.js",
  "middleware/auth.js",
  "routes/index.js",
  "models/Order.js",
  "models/Orderitem.js",
  "models/Payment.js",
  "models/associations.js",
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
}

const hbs = (await import("hbs")).default.handlebars;
for (const name of ["head", "header", "footer"]) hbs.registerPartial(name, "");

const productTemplate = hbs.compile(readFileSync(`${root}/views/product.xian`, "utf8"));
const productHtml = productTemplate({
  isAuthenticated: true,
  product: {
    id: 1,
    product_name: "Test dish",
    description: "Test description",
    price: "125.00",
    availability: true,
    category: { category_name: "Main" },
  },
});
assert.match(productHtml, /name="quantity"/);
assert.match(productHtml, /Add to Cart/);

const menuHtml = hbs.compile(readFileSync(`${root}/views/menu.xian`, "utf8"))({
  products: [],
  categories: [],
});
assert.doesNotMatch(menuHtml, /method="POST" action="\/cart\/items\//);

const cartHtml = hbs.compile(readFileSync(`${root}/views/cart.xian`, "utf8"))({
  cart: [{
    id: 1,
    product_id: 1,
    product_name: "Test dish",
    price: "125.00",
    quantity: 2,
    lineTotal: "250.00",
    productAvailable: true,
  }],
  canProceed: true,
  cartTotal: "250.00",
});
for (const text of ["Unit price", "Subtotal", "Proceed to Order", "/increase", "/decrease", "/remove"]) {
  assert.ok(cartHtml.includes(text), `Cart page must include ${text}.`);
}

const checkoutHtml = hbs.compile(readFileSync(`${root}/views/checkout.xian`, "utf8"))({
  items: [{
    product_name: "Test dish",
    quantity: 2,
    unitPrice: "10.25",
    subtotal: "20.50",
  }],
  total: "20.50",
  available: true,
  quoteToken: "a".repeat(64),
  form: { customerName: "Customer", phone: "09123456789", isPickup: true },
  gcashConfigured: true,
  gcashAccountName: "ServeSync",
  gcashNumber: "09123456789",
});
for (const text of ["Pay with GCash", "GCash transaction reference number", "termsAccepted", "orderConfirmed", "Place Order"]) {
  assert.ok(checkoutHtml.includes(text), `Checkout page must include ${text}.`);
}

const confirmationHtml = hbs.compile(readFileSync(`${root}/views/order-confirmation.xian`, "utf8"))({
  order: {
    customer_name: "Customer",
    order_number: "SS-20261111-AABBCCDD",
    status: "pending",
    total: "20.50",
    isDelivery: false,
    paymentIsPending: true,
    phone: "09123456789",
    pickup_instructions: "Pickup details",
    payment: { status: "pending", reference_code: "AB-123456" },
    items: [{
      product_name: "Test dish",
      quantity: 2,
      unitPrice: "10.25",
      lineTotal: "20.50",
    }],
  },
});
assert.match(confirmationHtml, /pending manual verification/);
assert.match(confirmationHtml, /SS-20261111-AABBCCDD/);
assert.equal(Order.rawAttributes.status.defaultValue, "pending");
assert.equal(Payment.rawAttributes.status.defaultValue, "pending");
assert.equal(Payment.rawAttributes.reference_code.unique, true);

const adminPaymentsHtml = hbs.compile(readFileSync(`${root}/views/admin-payments.xian`, "utf8"))({
  payments: [{
    id: 9,
    reference_code: "AB-123456",
    amount: "20.50",
    order: {
      order_number: "SS-20261111-AABBCCDD",
      customer_name: "Customer",
      total_amount: "20.50",
      order_type: "pickup",
      phone: "09123456789",
      items: [],
    },
  }],
});
assert.match(adminPaymentsHtml, /Mark payment verified/);
assert.match(adminPaymentsHtml, /actual GCash transaction/);

const createRequest = (quantity) => ({
  user: { id: 8 },
  params: { id: "12" },
  body: { quantity, price: "0.01" },
  messages: [],
  flash(type, message) {
    this.messages.push({ type, message });
  },
  redirect(destination) {
    this.destination = destination;
  },
});

const guestRequest = {
  method: "POST",
  path: "/cart/items/12",
  originalUrl: "/cart/items/12",
  session: {},
  messages: [],
  flash(type, message) {
    this.messages.push({ type, message });
  },
};
await requireCustomer[0](guestRequest, {
  redirect(destination) { guestRequest.destination = destination; },
}, () => assert.fail("Guest cart requests must require authentication."));
assert.equal(guestRequest.destination, "/login");
assert.equal(guestRequest.session.returnTo, "/menu/12");
assert.match(guestRequest.messages[0].message, /create an account or log in/i);

for (const quantity of ["0", "-1", "1.5", "100", "not-a-number"]) {
  const req = createRequest(quantity);
  await cartController.addToCart(req, { redirect(destination) { req.destination = destination; } });
  assert.equal(req.destination, "/menu/12");
  assert.equal(req.messages[0].type, "error_msg");
}

const originalMethods = {
  transaction: sequelize.transaction,
  productFindOne: Product.findOne,
  cartFindOne: Cart.findOne,
  cartItemFindAll: CartItem.findAll,
  itemFindOne: CartItem.findOne,
  itemCreate: CartItem.create,
  itemDestroy: CartItem.destroy,
  orderCreate: Order.create,
  orderItemBulkCreate: OrderItem.bulkCreate,
  paymentFindOne: Payment.findOne,
  paymentFindByPk: Payment.findByPk,
  paymentCreate: Payment.create,
};
const fakeTransaction = {
  LOCK: { UPDATE: "UPDATE" },
  finished: undefined,
  async commit() { this.finished = "commit"; },
  async rollback() { this.finished = "rollback"; },
};
let createdItem;
try {
  sequelize.transaction = async () => fakeTransaction;
  Product.findOne = async ({ where }) => {
    assert.equal(where.id, 12);
    assert.equal(where.status, "active");
    assert.equal(where.availability, true);
    return { price: "125.50", product_name: "Test dish" };
  };
  Cart.findOne = async () => ({ id: 4 });
  CartItem.findAll = async () => [];
  CartItem.findOne = async () => null;
  CartItem.create = async (item) => { createdItem = item; };

  const req = createRequest("2");
  await cartController.addToCart(req, { redirect(destination) { req.destination = destination; } });
  assert.equal(createdItem.quantity, 2);
  assert.equal(createdItem.price, "125.50", "Cart price must come from the product record.");
  assert.equal(req.destination, "/cart");
  assert.equal(fakeTransaction.finished, "commit");
} finally {
  sequelize.transaction = originalMethods.transaction;
  Product.findOne = originalMethods.productFindOne;
  Cart.findOne = originalMethods.cartFindOne;
  CartItem.findAll = originalMethods.cartItemFindAll;
  CartItem.findOne = originalMethods.itemFindOne;
  CartItem.create = originalMethods.itemCreate;
}

const checkoutTransaction = {
  LOCK: { UPDATE: "UPDATE" },
  finished: undefined,
  async commit() { this.finished = "commit"; },
  async rollback() { this.finished = "rollback"; },
};
const cart = { id: 7, async save() { this.saved = true; } };
const cartLines = [{
  id: 1,
  product_id: 12,
  quantity: 2,
  product: {
    id: 12,
    product_name: "Test dish",
    product_image: "/dish.jpg",
    image: "/dish.jpg",
    price: "10.25",
    status: "active",
    availability: true,
    category: { status: "active" },
  },
}];
const checkoutCalls = [];
let savedOrderItems;
let savedPayment;
let createdOrder;
const oldGcashSettings = {
  name: process.env.GCASH_ACCOUNT_NAME,
  number: process.env.GCASH_NUMBER,
};
try {
  process.env.GCASH_ACCOUNT_NAME = "ServeSync";
  process.env.GCASH_NUMBER = "09123456789";
  sequelize.transaction = async () => checkoutTransaction;
  Cart.findOne = async () => cart;
  CartItem.findAll = async () => cartLines;
  Payment.findOne = async () => null;
  Order.create = async values => {
    checkoutCalls.push("order");
    createdOrder = { id: 19, order_number: values.order_number, values };
    return createdOrder;
  };
  OrderItem.bulkCreate = async values => {
    checkoutCalls.push("items");
    savedOrderItems = values;
  };
  Payment.create = async values => {
    checkoutCalls.push("payment");
    savedPayment = values;
  };
  CartItem.destroy = async () => { checkoutCalls.push("clear-cart"); };

  const pageRequest = {
    user: { id: 8, full_name: "Customer", phone: "09123456789" },
    session: {},
  };
  let checkoutView;
  await cartController.checkoutPage(pageRequest, {
    render(view, data) { checkoutView = { view, data }; },
  });
  assert.equal(checkoutView.view, "checkout");
  assert.equal(checkoutView.data.total, "20.50");
  assert.equal(checkoutView.data.items[0].unitPrice, "10.25");

  const invalidAgreementRequest = {
    user: { id: 8 },
    body: {
      customerName: "Customer",
      phone: "09123456789",
      orderType: "pickup",
      referenceCode: "AB-123456",
      orderConfirmed: "on",
    },
    session: {},
    flash(type, message) { this.message = { type, message }; },
  };
  let invalidAgreementDestination;
  await cartController.placeOrder(invalidAgreementRequest, {
    redirect(destination) { invalidAgreementDestination = destination; },
  });
  assert.equal(invalidAgreementDestination, "/checkout");
  assert.match(invalidAgreementRequest.message.message, /terms and conditions/);
  assert.deepEqual(checkoutCalls, [], "Orders must not be created without explicit terms agreement.");

  const changedQuoteTransaction = {
    LOCK: { UPDATE: "UPDATE" },
    finished: undefined,
    async commit() { this.finished = "commit"; },
    async rollback() { this.finished = "rollback"; },
  };
  sequelize.transaction = async () => changedQuoteTransaction;
  cartLines[0].product.price = "10.50";
  const changedQuoteRequest = {
    user: { id: 8 },
    body: {
      customerName: "Customer",
      phone: "09123456789",
      orderType: "pickup",
      referenceCode: "AB-123456",
      termsAccepted: "on",
      orderConfirmed: "on",
      quoteToken: checkoutView.data.quoteToken,
    },
    session: {},
    flash(type, message) { this.message = { type, message }; },
  };
  let changedQuoteDestination;
  await cartController.placeOrder(changedQuoteRequest, {
    redirect(destination) { changedQuoteDestination = destination; },
  });
  assert.equal(changedQuoteTransaction.finished, "rollback");
  assert.equal(changedQuoteDestination, "/checkout");
  assert.deepEqual(checkoutCalls, [], "Changed prices must not be ordered against a stale checkout quote.");

  cartLines[0].product.price = "10.25";
  checkoutTransaction.finished = undefined;
  sequelize.transaction = async () => checkoutTransaction;
  await cartController.checkoutPage(pageRequest, {
    render(view, data) { checkoutView = { view, data }; },
  });
  const orderRequest = {
    user: { id: 8 },
    body: {
      customerName: "Customer",
      phone: "09123456789",
      orderType: "delivery",
      deliveryAddress: "1 ServeSync Street",
      referenceCode: "AB-123456",
      termsAccepted: "on",
      orderConfirmed: "on",
      quoteToken: checkoutView.data.quoteToken,
    },
    session: {},
    flash(type, message) { this.message = { type, message }; },
  };
  let orderDestination;
  await cartController.placeOrder(orderRequest, {
    redirect(destination) { orderDestination = destination; },
  });
  assert.equal(checkoutTransaction.finished, "commit");
  assert.equal(createdOrder.values.status, "pending");
  assert.equal(createdOrder.values.total_amount, "20.50");
  assert.equal(createdOrder.values.delivery_address, "1 ServeSync Street");
  assert.equal(savedOrderItems[0].product_name, "Test dish");
  assert.equal(savedOrderItems[0].unit_price, "10.25");
  assert.equal(savedOrderItems[0].subtotal, "20.50");
  assert.equal(savedPayment.status, "pending");
  assert.equal(savedPayment.method, "GCash");
  assert.equal(savedPayment.amount, "20.50");
  assert.deepEqual(checkoutCalls, ["order", "items", "payment", "clear-cart"]);
  assert.match(orderDestination, /^\/orders\/SS-/);

  const pendingPayment = {
    status: "pending",
    async save() { this.saved = true; },
  };
  Payment.findByPk = async () => pendingPayment;
  const verificationTransaction = {
    LOCK: { UPDATE: "UPDATE" },
    finished: undefined,
    async commit() { this.finished = "commit"; },
    async rollback() { this.finished = "rollback"; },
  };
  sequelize.transaction = async () => verificationTransaction;
  const verifyRequest = {
    params: { id: "9" },
    user: { id: 3 },
    flash(type, message) { this.message = { type, message }; },
  };
  let verifyDestination;
  await cartController.verifyPayment(verifyRequest, {
    redirect(destination) { verifyDestination = destination; },
  });
  assert.equal(pendingPayment.status, "verified");
  assert.equal(pendingPayment.verified_by, 3);
  assert.ok(pendingPayment.verified_at instanceof Date);
  assert.equal(verificationTransaction.finished, "commit");
  assert.equal(verifyDestination, "/admin/payments");
  assert.notEqual(pendingPayment.status, "paid");
} finally {
  sequelize.transaction = originalMethods.transaction;
  Cart.findOne = originalMethods.cartFindOne;
  CartItem.findAll = originalMethods.cartItemFindAll;
  CartItem.destroy = originalMethods.itemDestroy;
  Order.create = originalMethods.orderCreate;
  OrderItem.bulkCreate = originalMethods.orderItemBulkCreate;
  Payment.findOne = originalMethods.paymentFindOne;
  Payment.findByPk = originalMethods.paymentFindByPk;
  Payment.create = originalMethods.paymentCreate;
  if (oldGcashSettings.name === undefined) delete process.env.GCASH_ACCOUNT_NAME;
  else process.env.GCASH_ACCOUNT_NAME = oldGcashSettings.name;
  if (oldGcashSettings.number === undefined) delete process.env.GCASH_NUMBER;
  else process.env.GCASH_NUMBER = oldGcashSettings.number;
}

console.log("Cart and manual GCash checkout checks passed.");