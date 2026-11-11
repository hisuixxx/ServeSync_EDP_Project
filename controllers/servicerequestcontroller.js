import {
  CateringRequest,
  DeliveryRequest,
  RequestStatusHistory,
  User,
} from "../models/associations.js";
import { sequelize } from "../models/db.js";

const REQUEST_STATUSES = ["pending", "approved", "rejected", "completed", "cancelled"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9][0-9\s()-]{6,29}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const localDateString = () => {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  && value >= localDateString();

const getFormValues = (body, fields) => Object.fromEntries(fields.map(field => [
  field,
  typeof body[field] === "string" ? body[field].trim() : "",
]));

const validateCommon = (form) => {
  const errors = [];
  if (!form.customerName || form.customerName.length > 150) {
    errors.push("Enter your name (up to 150 characters).");
  }
  if (!phonePattern.test(form.contactNumber)) errors.push("Enter a valid contact number.");
  if (!form.specialInstructions) form.specialInstructions = "";
  if (form.specialInstructions.length > 5000) errors.push("Special instructions must be 5,000 characters or fewer.");
  return errors;
};

const renderRequestForm = (res, type, form, errors, status = 400) => res.status(status).render(
  type === "catering" ? "catering-request" : "delivery-request",
  {
    title: `ServeSync | ${type === "catering" ? "Catering" : "Delivery"} request`,
    minDate: localDateString(),
    form,
    errors,
  },
);

const writeInitialHistory = (type, requestId, userId, transaction) => RequestStatusHistory.create({
  request_type: type,
  catering_request_id: type === "catering" ? requestId : null,
  delivery_request_id: type === "delivery" ? requestId : null,
  previous_status: null,
  status: "pending",
  changed_by: userId,
  reason: "Request submitted",
}, { transaction });

const includeHistory = [{
  model: RequestStatusHistory,
  as: "history",
  include: [{ model: User, as: "changedBy", attributes: ["id", "full_name", "role"] }],
}];

const formatRequest = (request, type) => {
  const details = request.get({ plain: true });
  details.isCatering = type === "catering";
  details.requestType = details.isCatering ? "Catering" : "Delivery";
  details.statusOptions = REQUEST_STATUSES.map(status => ({
    value: status,
    isSelected: status === details.status,
  }));
  details.history = (details.history || []).sort((left, right) => (
    new Date(left.createdAt) - new Date(right.createdAt)
  ));
  return details;
};

const createCatering = async (req, res) => {
  const form = getFormValues(req.body, [
    "customerName",
    "contactNumber",
    "email",
    "eventDate",
    "eventTime",
    "eventLocation",
    "guestCount",
    "foodPreferences",
    "specialInstructions",
  ]);
  const errors = validateCommon(form);
  if (!emailPattern.test(form.email)) errors.push("Enter a valid email address.");
  if (!isValidDate(form.eventDate)) errors.push("Choose an event date that is today or later.");
  if (isValidDate(form.eventDate) && form.eventDate === localDateString()
    && timePattern.test(form.eventTime)) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (form.eventTime < currentTime) errors.push("Choose an event time that has not passed.");
  }
  if (!timePattern.test(form.eventTime)) errors.push("Enter a valid event time.");
  if (!form.eventLocation || form.eventLocation.length > 500) errors.push("Enter an event location (up to 500 characters).");
  const guestCount = Number(form.guestCount);
  if (!/^\d+$/.test(form.guestCount) || !Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 10000) {
    errors.push("Guest count must be between 1 and 10,000.");
  }
  if (!form.foodPreferences || form.foodPreferences.length > 5000) {
    errors.push("Enter your catering package or food preferences (up to 5,000 characters).");
  }
  if (errors.length) return renderRequestForm(res, "catering", form, errors);

  let transaction;
  try {
    transaction = await sequelize.transaction();
    const request = await CateringRequest.create({
      customer_id: req.user.id,
      customer_name: form.customerName,
      contact_number: form.contactNumber,
      email: form.email.toLowerCase(),
      event_date: form.eventDate,
      event_time: `${form.eventTime}:00`,
      event_location: form.eventLocation,
      guest_count: guestCount,
      food_preferences: form.foodPreferences,
      special_instructions: form.specialInstructions || null,
      status: "pending",
    }, { transaction });
    await writeInitialHistory("catering", request.id, req.user.id, transaction);
    await transaction.commit();
    req.flash("success_msg", "Your catering request was submitted.");
    res.redirect("/my-requests");
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Unable to submit catering request:", error.message);
    req.flash("error_msg", "Unable to submit your catering request. Please try again.");
    res.redirect("/request/catering");
  }
};

const createDelivery = async (req, res) => {
  const form = getFormValues(req.body, [
    "customerName",
    "contactNumber",
    "deliveryAddress",
    "requestedDate",
    "preferredTime",
    "orderDetails",
    "specialInstructions",
  ]);
  const errors = validateCommon(form);
  if (!form.deliveryAddress || form.deliveryAddress.length > 500) errors.push("Enter a delivery address (up to 500 characters).");
  if (!isValidDate(form.requestedDate)) errors.push("Choose a delivery date that is today or later.");
  if (isValidDate(form.requestedDate) && form.requestedDate === localDateString()
    && timePattern.test(form.preferredTime)) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (form.preferredTime < currentTime) errors.push("Choose a delivery time that has not passed.");
  }
  if (!timePattern.test(form.preferredTime)) errors.push("Enter a valid preferred delivery time.");
  if (!form.orderDetails || form.orderDetails.length > 5000) {
    errors.push("Enter your food preferences or order details (up to 5,000 characters).");
  }
  if (errors.length) return renderRequestForm(res, "delivery", form, errors);

  let transaction;
  try {
    transaction = await sequelize.transaction();
    const request = await DeliveryRequest.create({
      customer_id: req.user.id,
      customer_name: form.customerName,
      contact_number: form.contactNumber,
      delivery_address: form.deliveryAddress,
      requested_date: form.requestedDate,
      preferred_time: `${form.preferredTime}:00`,
      order_details: form.orderDetails,
      special_instructions: form.specialInstructions || null,
      status: "pending",
    }, { transaction });
    await writeInitialHistory("delivery", request.id, req.user.id, transaction);
    await transaction.commit();
    req.flash("success_msg", "Your delivery request was submitted.");
    res.redirect("/my-requests");
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Unable to submit delivery request:", error.message);
    req.flash("error_msg", "Unable to submit your delivery request. Please try again.");
    res.redirect("/request/delivery");
  }
};

const listCustomerRequests = async (req, res) => {
  try {
    const [cateringRequests, deliveryRequests] = await Promise.all([
      CateringRequest.findAll({
        where: { customer_id: req.user.id },
        include: includeHistory,
        order: [["createdAt", "DESC"]],
      }),
      DeliveryRequest.findAll({
        where: { customer_id: req.user.id },
        include: includeHistory,
        order: [["createdAt", "DESC"]],
      }),
    ]);
    res.render("my-requests", {
      title: "ServeSync | My service requests",
      cateringRequests: cateringRequests.map(request => formatRequest(request, "catering")),
      deliveryRequests: deliveryRequests.map(request => formatRequest(request, "delivery")),
    });
  } catch (error) {
    console.error("Unable to load customer requests:", error.message);
    res.status(500).render("my-requests", {
      title: "ServeSync | My service requests",
      cateringRequests: [],
      deliveryRequests: [],
      loadError: "Unable to load your requests. Please try again.",
    });
  }
};

const listAdminRequests = async (res, type) => {
  const Model = type === "catering" ? CateringRequest : DeliveryRequest;
  const requests = await Model.findAll({
    include: [
      { model: User, as: "customer", attributes: ["id", "full_name", "email", "phone"] },
      { model: User, as: "reviewer", attributes: ["id", "full_name"] },
      ...includeHistory,
    ],
    order: [["createdAt", "DESC"]],
  });
  res.render("admin-requests", {
    title: `ServeSync | ${type === "catering" ? "Catering" : "Delivery"} requests`,
    requestType: type,
    requestTypeLabel: type === "catering" ? "Catering" : "Delivery",
    isCatering: type === "catering",
    requests: requests.map(request => formatRequest(request, type)),
    statuses: REQUEST_STATUSES,
  });
};

const listApprovedRequests = async (res, type) => {
  const Model = type === "catering" ? CateringRequest : DeliveryRequest;
  const requests = await Model.findAll({
    where: { status: "approved" },
    include: [{ model: User, as: "customer", attributes: ["id", "full_name", "email", "phone"] }],
    order: type === "catering"
      ? [["event_date", "ASC"], ["event_time", "ASC"]]
      : [["requested_date", "ASC"], ["preferred_time", "ASC"]],
  });
  res.render("staff-requests", {
    title: `ServeSync | Approved ${type} operations`,
    requestType: type,
    requests: requests.map(request => formatRequest(request, type)),
  });
};

const updateRequestStatus = async (req, res) => {
  const type = req.params.type;
  const Model = type === "catering" ? CateringRequest : DeliveryRequest;
  const requestId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
  const status = typeof req.body.status === "string" ? req.body.status : "";
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  const redirectPath = `/admin/requests/${type}`;

  if (!["catering", "delivery"].includes(type)
    || !Number.isSafeInteger(requestId)
    || requestId < 1
    || !REQUEST_STATUSES.includes(status)
    || reason.length > 2000
    || (status === "rejected" && !reason)) {
    req.flash("error_msg", status === "rejected" && !reason
      ? "A rejection reason is required."
      : "Choose a valid request status and reason.");
    return res.redirect(redirectPath);
  }

  let transaction;
  try {
    transaction = await sequelize.transaction();
    const request = await Model.findByPk(requestId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) {
      await transaction.rollback();
      req.flash("error_msg", "Service request not found.");
      return res.redirect(redirectPath);
    }

    const previousStatus = request.status;
    request.status = status;
    request.rejection_reason = status === "rejected" ? reason : null;
    request.reviewed_by = req.user.id;
    request.reviewed_at = new Date();
    await request.save({ transaction });
    await RequestStatusHistory.create({
      request_type: type,
      catering_request_id: type === "catering" ? request.id : null,
      delivery_request_id: type === "delivery" ? request.id : null,
      previous_status: previousStatus,
      status,
      changed_by: req.user.id,
      reason: status === "rejected" ? reason : reason || null,
    }, { transaction });
    await transaction.commit();
    req.flash("success_msg", `${type === "catering" ? "Catering" : "Delivery"} request status updated to ${status}.`);
    res.redirect(redirectPath);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Unable to update service request:", error.message);
    req.flash("error_msg", "Unable to update the request. Please try again.");
    res.redirect(redirectPath);
  }
};

const serviceRequestController = {
  cateringForm: (req, res) => res.render("catering-request", {
    title: "ServeSync | Catering request",
    minDate: localDateString(),
    form: {
      customerName: req.user.full_name,
      contactNumber: req.user.phone || "",
      email: req.user.email,
    },
  }),
  deliveryForm: (req, res) => res.render("delivery-request", {
    title: "ServeSync | Delivery request",
    minDate: localDateString(),
    form: {
      customerName: req.user.full_name,
      contactNumber: req.user.phone || "",
    },
  }),
  createCatering,
  createDelivery,
  listCustomerRequests,
  adminCateringRequests: async (req, res) => {
    try {
      await listAdminRequests(res, "catering");
    } catch (error) {
      console.error("Unable to load catering requests:", error.message);
      res.status(500).render("admin-requests", {
        title: "ServeSync | Catering requests",
        requestType: "catering",
        requestTypeLabel: "Catering",
        isCatering: true,
        requests: [],
        statuses: REQUEST_STATUSES,
        loadError: "Unable to load catering requests. Please try again.",
      });
    }
  },
  adminDeliveryRequests: async (req, res) => {
    try {
      await listAdminRequests(res, "delivery");
    } catch (error) {
      console.error("Unable to load delivery requests:", error.message);
      res.status(500).render("admin-requests", {
        title: "ServeSync | Delivery requests",
        requestType: "delivery",
        requestTypeLabel: "Delivery",
        isCatering: false,
        requests: [],
        statuses: REQUEST_STATUSES,
        loadError: "Unable to load delivery requests. Please try again.",
      });
    }
  },
  staffCateringRequests: async (req, res) => {
    try {
      await listApprovedRequests(res, "catering");
    } catch (error) {
      console.error("Unable to load approved catering requests:", error.message);
      res.status(500).render("staff-requests", {
        title: "ServeSync | Approved catering operations",
        requestType: "catering",
        isCatering: true,
        requests: [],
        loadError: "Unable to load approved catering requests. Please try again.",
      });
    }
  },
  staffDeliveryRequests: async (req, res) => {
    try {
      await listApprovedRequests(res, "delivery");
    } catch (error) {
      console.error("Unable to load approved delivery requests:", error.message);
      res.status(500).render("staff-requests", {
        title: "ServeSync | Approved delivery operations",
        requestType: "delivery",
        isCatering: false,
        requests: [],
        loadError: "Unable to load approved delivery requests. Please try again.",
      });
    }
  },
  updateRequestStatus,
};

export { serviceRequestController };
