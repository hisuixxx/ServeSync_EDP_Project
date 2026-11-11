import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serviceRequestController } from "../controllers/servicerequestcontroller.js";
import {
  CateringRequest,
  DeliveryRequest,
  RequestStatusHistory,
  User,
} from "../models/associations.js";
import { sequelize } from "../models/db.js";
import { requireRole } from "../middleware/auth.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const syntaxFiles = [
  "controllers/servicerequestcontroller.js",
  "routes/index.js",
  "models/CateringRequest.js",
  "models/DeliveryRequest.js",
  "models/RequestStatusHistory.js",
  "models/associations.js",
];
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
}

const hbs = (await import("hbs")).default.handlebars;
for (const name of ["head", "header", "footer"]) hbs.registerPartial(name, "");
const compile = (file) => hbs.compile(readFileSync(`${root}/views/${file}`, "utf8"));
const cateringHtml = compile("catering-request.xian")({
  minDate: "2026-11-11",
  form: {},
});
for (const name of ["customerName", "contactNumber", "email", "eventDate", "eventTime", "eventLocation", "guestCount", "foodPreferences", "specialInstructions"]) {
  assert.ok(cateringHtml.includes(`name="${name}"`), `Catering form must include ${name}.`);
}
const deliveryHtml = compile("delivery-request.xian")({
  minDate: "2026-11-11",
  form: {},
});
for (const name of ["customerName", "contactNumber", "deliveryAddress", "requestedDate", "preferredTime", "orderDetails", "specialInstructions"]) {
  assert.ok(deliveryHtml.includes(`name="${name}"`), `Delivery form must include ${name}.`);
}
const customerRequestsHtml = compile("my-requests.xian")({
  cateringRequests: [{
    id: 1,
    status: "pending",
    customer_name: "Customer",
    event_date: "2026-11-20",
    event_time: "14:30",
    event_location: "ServeSync Hall",
    guest_count: 20,
    food_preferences: "Vegetarian package",
    history: [{ status: "pending", createdAt: "2026-11-11" }],
  }],
  deliveryRequests: [],
});
assert.match(customerRequestsHtml, /Status history/);
const adminHtml = compile("admin-requests.xian")({
  requestTypeLabel: "Catering",
  isCatering: true,
  requests: [{
    id: 1,
    requestType: "Catering",
    status: "pending",
    isCatering: true,
    statusOptions: [{ value: "pending", isSelected: true }],
    history: [],
    customer: { full_name: "Customer", email: "customer@example.com" },
  }],
});
assert.match(adminHtml, /Save status/);
assert.match(adminHtml, /rejection_reason|Reason/);
const staffHtml = compile("staff-requests.xian")({ requestType: "Catering", requests: [] });
assert.doesNotMatch(staffHtml, /<form|Save status|>Approve<|>Reject</);

const expectedStatuses = ["pending", "approved", "rejected", "completed", "cancelled"];
for (const Model of [CateringRequest, DeliveryRequest]) {
  assert.deepEqual(Model.rawAttributes.status.type.values, expectedStatuses);
}
assert.equal(CateringRequest.associations.customer.foreignKey, "customer_id");
assert.equal(DeliveryRequest.associations.customer.foreignKey, "customer_id");
assert.equal(CateringRequest.associations.history.foreignKey, "catering_request_id");
assert.equal(DeliveryRequest.associations.history.foreignKey, "delivery_request_id");

const oldMethods = {
  transaction: sequelize.transaction,
  cateringCreate: CateringRequest.create,
  deliveryCreate: DeliveryRequest.create,
  cateringFindByPk: CateringRequest.findByPk,
  deliveryFindAll: DeliveryRequest.findAll,
  historyCreate: RequestStatusHistory.create,
};
const makeTransaction = () => ({
  LOCK: { UPDATE: "UPDATE" },
  finished: undefined,
  async commit() { this.finished = "commit"; },
  async rollback() { this.finished = "rollback"; },
});
try {
  let transaction = makeTransaction();
  let transactionCount = 0;
  sequelize.transaction = async () => {
    transactionCount += 1;
    return transaction;
  };
  const invalidRequest = {
    body: { customerName: "Test", contactNumber: "123", email: "bad", eventDate: "not-a-date" },
    user: { id: 7 },
  };
  let invalidView;
  await serviceRequestController.createCatering(invalidRequest, {
    status(code) { this.statusCode = code; return this; },
    render(view, data) { invalidView = { view, data }; },
  });
  assert.equal(transactionCount, 0, "Invalid submissions must not start a DB transaction.");
  assert.equal(invalidView.view, "catering-request");
  assert.ok(invalidView.data.errors.length);

  const today = new Date();
  today.setDate(today.getDate() + 1);
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  CateringRequest.create = async values => ({ id: 11, ...values });
  let initialHistory;
  RequestStatusHistory.create = async values => { initialHistory = values; };
  const cateringReq = {
    user: { id: 7 },
    body: {
      customerName: "Customer",
      contactNumber: "+1 (555) 123-4567",
      email: " CUSTOMER@example.com ",
      eventDate: localToday,
      eventTime: "14:30",
      eventLocation: "ServeSync Hall",
      guestCount: "35",
      foodPreferences: "Vegetarian package",
      specialInstructions: "No peanuts",
    },
    flash(type, message) { this.message = { type, message }; },
  };
  let cateringDestination;
  await serviceRequestController.createCatering(cateringReq, {
    redirect(path) { cateringDestination = path; },
  });
  assert.equal(transaction.finished, "commit");
  assert.equal(initialHistory.request_type, "catering");
  assert.equal(initialHistory.status, "pending");
  assert.equal(cateringDestination, "/my-requests");

  transaction = makeTransaction();
  DeliveryRequest.create = async values => ({ id: 21, ...values });
  const deliveryReq = {
    user: { id: 7 },
    body: {
      customerName: "Customer",
      contactNumber: "+1 (555) 123-4567",
      deliveryAddress: "1 ServeSync Street",
      requestedDate: localToday,
      preferredTime: "16:00",
      orderDetails: "Two vegetarian meals",
      specialInstructions: "Call on arrival",
    },
    flash(type, message) { this.message = { type, message }; },
  };
  let deliveryDestination;
  await serviceRequestController.createDelivery(deliveryReq, {
    redirect(path) { deliveryDestination = path; },
  });
  assert.equal(transaction.finished, "commit");
  assert.equal(initialHistory.request_type, "delivery");
  assert.equal(initialHistory.delivery_request_id, 21);
  assert.equal(deliveryDestination, "/my-requests");

  transaction = makeTransaction();
  let updatedRequest;
  CateringRequest.findByPk = async () => ({
    id: 11,
    status: "pending",
    async save() { updatedRequest = { ...this }; },
  });
  let rejectionHistory;
  RequestStatusHistory.create = async values => { rejectionHistory = values; };
  const adminReq = {
    params: { type: "catering", id: "11" },
    body: { status: "rejected", reason: "Date unavailable" },
    user: { id: 2 },
    flash(type, message) { this.message = { type, message }; },
  };
  let adminStatus = 302;
  let adminDestination;
  await serviceRequestController.updateRequestStatus(adminReq, {
    status(code) { adminStatus = code; return this; },
    redirect(path) { adminDestination = path; },
  });
  assert.equal(adminStatus, 302);
  assert.equal(transaction.finished, "commit");
  assert.equal(updatedRequest.status, "rejected");
  assert.equal(updatedRequest.rejection_reason, "Date unavailable");
  assert.equal(updatedRequest.reviewed_by, 2);
  assert.equal(rejectionHistory.previous_status, "pending");
  assert.equal(rejectionHistory.changed_by, 2);
  assert.equal(adminDestination, "/admin/requests/catering");

  let staffFilter;
  DeliveryRequest.findAll = async options => {
    staffFilter = options.where;
    return [];
  };
  let staffView;
  await serviceRequestController.staffDeliveryRequests({}, {
    render(view, data) { staffView = { view, data }; },
  });
  assert.deepEqual(staffFilter, { status: "approved" });
  assert.equal(staffView.view, "staff-requests");

  let roleRedirect;
  let nextCalled = false;
  requireRole(["staff", "admin"])[1](
    { user: { role: "customer" }, session: {} },
    { redirect(path) { roleRedirect = path; } },
    () => { nextCalled = true; },
  );
  assert.equal(roleRedirect, "/login");
  assert.equal(nextCalled, false, "Customers must not access the staff request view.");
} finally {
  sequelize.transaction = oldMethods.transaction;
  CateringRequest.create = oldMethods.cateringCreate;
  DeliveryRequest.create = oldMethods.deliveryCreate;
  CateringRequest.findByPk = oldMethods.cateringFindByPk;
  DeliveryRequest.findAll = oldMethods.deliveryFindAll;
  RequestStatusHistory.create = oldMethods.historyCreate;
}

console.log("Catering and delivery request checks passed.");
