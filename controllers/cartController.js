/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  Cart,
  CartItem,
  Product,
  Category,
  Order,
  OrderItem,
  Payment,
} from "../models/associations.js";
import { sequelize } from "../models/db.js";

const MAX_CART_QUANTITY = 99;

const parseQuantity = (value) => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_QUANTITY
    ? quantity
    : null;
};

const formatCents = (cents) => (cents / 100).toFixed(2);
const toCents = (amount) => Math.round(Number(amount) * 100);

const checkoutPaymentDetails = () => ({
  gcashAccountName: process.env.GCASH_ACCOUNT_NAME?.trim() || "",
  gcashNumber: process.env.GCASH_NUMBER?.trim() || "",
  gcashQrImage: process.env.GCASH_QR_IMAGE || "",
  gcashInstructions: process.env.GCASH_PAYMENT_INSTRUCTIONS
    || "Send the exact total to the GCash account above, then enter the transaction reference number below. ServeSync will verify your payment manually.",
  gcashConfigured: Boolean(process.env.GCASH_ACCOUNT_NAME?.trim() && process.env.GCASH_NUMBER?.trim()),
  pickupInstructions: process.env.RESTAURANT_PICKUP_INSTRUCTIONS
    || "ServeSync will confirm the pickup location and ready time after reviewing your order.",
});

const loadCheckoutCart = async (userId, transaction) => {
  const cart = await Cart.findOne({
    where: { user_id: userId, status: "active" },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!cart) return null;

  const items = await CartItem.findAll({
    where: { cart_id: cart.id },
    include: [{
      model: Product,
      as: "product",
      required: false,
      include: [{
        model: Category,
        as: "category",
        required: false,
      }],
    }],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  let totalCents = 0;
  const checkoutItems = items.map(item => {
    const product = item.product;
    const priceCents = product ? toCents(product.price) : toCents(item.price);
    const subtotalCents = priceCents * item.quantity;
    totalCents += subtotalCents;
    return {
      id: item.id,
      product_id: item.product_id,
      product_name: product?.product_name || "Unavailable product",
      product_image: product?.image || "",
      quantity: item.quantity,
      unitPrice: formatCents(priceCents),
      subtotal: formatCents(subtotalCents),
      productAvailable: Boolean(
        product
        && product.status === "active"
        && product.availability
        && product.category?.status === "active"
      ),
    };
  });

  return {
    cart,
    items,
    checkoutItems,
    totalCents,
    total: formatCents(totalCents),
    available: checkoutItems.length > 0 && checkoutItems.every(item => item.productAvailable),
  };
};

const checkoutFormValues = (body = {}) => ({
  customerName: typeof body.customerName === "string" ? body.customerName.trim() : "",
  phone: typeof body.phone === "string" ? body.phone.trim() : "",
  orderType: typeof body.orderType === "string" ? body.orderType : "",
  deliveryAddress: typeof body.deliveryAddress === "string" ? body.deliveryAddress.trim() : "",
  referenceCode: typeof body.referenceCode === "string" ? body.referenceCode.trim() : "",
  termsAccepted: body.termsAccepted === "on",
  orderConfirmed: body.orderConfirmed === "on",
});

const orderNumber = () => `SS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(8).toString("hex").toUpperCase()}`;

const checkoutQuoteToken = ({ cart, items }) => {
  const quote = {
    cartId: cart.id,
    items: items.map(item => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product?.product_name || null,
      quantity: item.quantity,
      price: item.product ? toCents(item.product.price) : null,
    })).sort((left, right) => left.id - right.id),
  };
  return createHmac("sha256", process.env.SESSION_SECRET || "development-only-change-me")
    .update(JSON.stringify(quote))
    .digest("hex");
};

const isValidCheckoutQuote = (quoteToken, checkout) => {
  if (typeof quoteToken !== "string" || !/^[a-f0-9]{64}$/.test(quoteToken)) return false;
  const expected = Buffer.from(checkoutQuoteToken(checkout), "hex");
  const submitted = Buffer.from(quoteToken, "hex");
  return timingSafeEqual(expected, submitted);
};

const cartItemForUser = (itemId, userId, transaction) => CartItem.findOne({
  where: { id: itemId },
  include: [{
    model: Cart,
    as: "cart",
    where: { user_id: userId, status: "active" },
    required: true,
  }],
  transaction,
  lock: transaction ? transaction.LOCK.UPDATE : undefined,
});

const cartController = {
  cartPage: async (req, res) => {
    try {
      const userId = req.user.id;
      const cart = await Cart.findOne({
        where: { user_id: userId, status: "active" },
        include: [{
          model: CartItem,
          as: "items",
          include: [{
            model: Product,
            as: "product",
            required: false,
            include: [{
              model: Category,
              as: "category",
              required: false,
            }],
          }],
        }],
      });

      let cartItems = [];
      let cartTotalCents = 0;

      if (cart && cart.items.length > 0) {
        cartItems = cart.items.map(item => {
          const unitPriceCents = Math.round(Number(item.price) * 100);
          const lineTotalCents = unitPriceCents * item.quantity;
          cartTotalCents += lineTotalCents;
          return {
            id: item.id,
            product_id: item.product_id,
            product_name: item.product?.product_name || "Unavailable product",
            product_image: item.product?.image || "",
            category_name: item.product?.category?.category_name || "",
            productAvailable: Boolean(
              item.product
              && item.product.status === "active"
              && item.product.availability
              && item.product.category?.status === "active"
            ),
            quantity: item.quantity,
            price: formatCents(unitPriceCents),
            lineTotal: formatCents(lineTotalCents),
          };
        });
      }

      res.render("cart", {
        title: "ServeSync | Your Cart",
        cart: cartItems,
        cartTotal: formatCents(cartTotalCents),
        canProceed: cartItems.length > 0 && cartItems.every(item => item.productAvailable),
        orderConfirmation: req.session.orderConfirmation || null,
      });

      delete req.session.orderConfirmation;
    } catch (error) {
      console.error("Error loading cart:", error.message);
      res.status(500).render("cart", {
        title: "ServeSync | Your Cart",
        cart: [],
        cartTotal: "0.00",
        canProceed: false,
        error: "Unable to load your cart. Please try again.",
      });
    }
  },

  addToCart: async (req, res) => {
    let transaction;
    try {
      const userId = req.user.id;
      const productId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
      const quantity = parseQuantity(req.body.quantity);

      if (!Number.isSafeInteger(productId) || productId < 1 || !quantity) {
        req.flash("error_msg", "Choose a valid quantity between 1 and 99.");
        return res.redirect(productId ? `/menu/${productId}` : "/menu");
      }

      transaction = await sequelize.transaction();
      const product = await Product.findOne({
        where: { id: productId, status: "active", availability: true },
        include: [{
          model: Category,
          as: "category",
          where: { status: "active" },
          required: true,
        }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "This product is unavailable and cannot be added to your cart.");
        return res.redirect(`/menu/${productId}`);
      }

      let cart = await Cart.findOne({
        where: { user_id: userId, status: "active" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!cart) {
        cart = await Cart.create({
          user_id: userId,
          status: "active",
        }, { transaction });
      }

      let cartItem = await CartItem.findOne({
        where: { cart_id: cart.id, product_id: productId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (cartItem && cartItem.quantity + quantity > MAX_CART_QUANTITY) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", `You can add up to ${MAX_CART_QUANTITY} of this item.`);
        return res.redirect(`/menu/${productId}`);
      }

      if (cartItem) {
        cartItem.quantity += quantity;
        cartItem.price = product.price;
        await cartItem.save({ transaction });
      } else {
        await CartItem.create({
          cart_id: cart.id,
          product_id: productId,
          quantity,
          price: product.price,
        }, { transaction });
      }

      await transaction.commit();
      transaction = null;
      req.flash("success_msg", `${product.product_name} added to your cart.`);
      res.redirect("/cart");
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error adding to cart:", error.message);
      req.flash("error_msg", "Unable to add item to cart. Please try again.");
      res.redirect(`/menu/${req.params.id}`);
    }
  },

  increaseCartItem: async (req, res) => {
    let transaction;
    try {
      const userId = req.user.id;
      const itemId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
      if (!Number.isSafeInteger(itemId) || itemId < 1) {
        req.flash("error_msg", "Cart item not found.");
        return res.redirect("/cart");
      }

      transaction = await sequelize.transaction();
      const cartItem = await cartItemForUser(itemId, userId, transaction);
      if (!cartItem) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "Cart item not found.");
        return res.redirect("/cart");
      }

      const product = await Product.findOne({
        where: { id: cartItem.product_id, status: "active", availability: true },
        include: [{
          model: Category,
          as: "category",
          where: { status: "active" },
          required: true,
        }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "This product is unavailable and cannot be increased.");
        return res.redirect("/cart");
      }
      if (cartItem.quantity >= MAX_CART_QUANTITY) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", `You can add up to ${MAX_CART_QUANTITY} of this item.`);
        return res.redirect("/cart");
      }

      cartItem.quantity += 1;
      cartItem.price = product.price;
      await cartItem.save({ transaction });
      await transaction.commit();
      transaction = null;
      res.redirect("/cart");
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error increasing cart item:", error.message);
      req.flash("error_msg", "Unable to update your cart. Please try again.");
      res.redirect("/cart");
    }
  },

  decreaseCartItem: async (req, res) => {
    let transaction;
    try {
      const userId = req.user.id;
      const itemId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
      if (!Number.isSafeInteger(itemId) || itemId < 1) {
        req.flash("error_msg", "Cart item not found.");
        return res.redirect("/cart");
      }

      transaction = await sequelize.transaction();
      const cartItem = await cartItemForUser(itemId, userId, transaction);
      if (!cartItem) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "Cart item not found.");
        return res.redirect("/cart");
      }

      cartItem.quantity = Math.max(1, cartItem.quantity - 1);
      await cartItem.save({ transaction });
      await transaction.commit();
      transaction = null;
      res.redirect("/cart");
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error decreasing cart item:", error.message);
      req.flash("error_msg", "Unable to update your cart. Please try again.");
      res.redirect("/cart");
    }
  },

  removeCartItem: async (req, res) => {
    try {
      const userId = req.user.id;
      const itemId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
      if (!Number.isSafeInteger(itemId) || itemId < 1) {
        req.flash("error_msg", "Cart item not found.");
        return res.redirect("/cart");
      }

      const cartItem = await cartItemForUser(itemId, userId);
      if (!cartItem) {
        req.flash("error_msg", "Cart item not found.");
        return res.redirect("/cart");
      }

      await cartItem.destroy();
      req.flash("success_msg", "Item removed from your cart.");
      res.redirect("/cart");
    } catch (error) {
      console.error("Error removing cart item:", error.message);
      req.flash("error_msg", "Unable to remove item from cart. Please try again.");
      res.redirect("/cart");
    }
  },

  checkoutPage: async (req, res) => {
    try {
      const checkout = await loadCheckoutCart(req.user.id);
      if (!checkout || checkout.items.length === 0) {
        req.flash("error_msg", "Your cart is empty.");
        return res.redirect("/cart");
      }

      const form = req.session.checkoutForm || {};
      delete req.session.checkoutForm;
      res.render("checkout", {
        title: "ServeSync | Review your order",
        items: checkout.checkoutItems,
        total: checkout.total,
        available: checkout.available,
        quoteToken: checkoutQuoteToken(checkout),
        form: {
          customerName: form.customerName || req.user.full_name,
          phone: form.phone || req.user.phone || "",
          orderType: form.orderType || "pickup",
          isDelivery: (form.orderType || "pickup") === "delivery",
          isPickup: (form.orderType || "pickup") === "pickup",
          deliveryAddress: form.deliveryAddress || "",
          referenceCode: form.referenceCode || "",
          termsAccepted: form.termsAccepted === true,
          orderConfirmed: form.orderConfirmed === true,
        },
        ...checkoutPaymentDetails(),
      });
    } catch (error) {
      console.error("Unable to load checkout:", error.message);
      res.status(500).render("not-found", {
        title: "ServeSync | Checkout unavailable",
        hideGuestAuth: true,
      });
    }
  },

  placeOrder: async (req, res) => {
    let transaction;
    const form = checkoutFormValues(req.body);
    const referenceCode = form.referenceCode.toUpperCase();
    const paymentDetails = checkoutPaymentDetails();
    const errors = [];

    if (!paymentDetails.gcashConfigured) {
      errors.push("GCash payments are not configured. Please contact the restaurant before placing an order.");
    }
    if (!form.customerName || form.customerName.length > 150) {
      errors.push("Enter a customer name of no more than 150 characters.");
    }
    if (!/^\+?[0-9][0-9\s()-]{6,19}$/.test(form.phone)) {
      errors.push("Enter a valid contact number.");
    }
    if (!["delivery", "pickup"].includes(form.orderType)) {
      errors.push("Choose delivery or pickup.");
    }
    if (form.orderType === "delivery" && (!form.deliveryAddress || form.deliveryAddress.length > 500)) {
      errors.push("Enter a delivery address of no more than 500 characters.");
    }
    if (!/^[A-Z0-9-]{6,40}$/.test(referenceCode)) {
      errors.push("Enter a valid GCash reference number (6-40 letters, numbers, or hyphens).");
    }
    if (!form.termsAccepted) errors.push("Read and accept the terms and conditions before ordering.");
    if (!form.orderConfirmed) errors.push("Confirm that your order information is correct.");

    if (errors.length) {
      req.session.checkoutForm = form;
      req.flash("error_msg", errors.join(" "));
      return res.redirect("/checkout");
    }

    try {
      const duplicatePayment = await Payment.findOne({
        where: { reference_code: referenceCode },
      });
      if (duplicatePayment) {
        req.session.checkoutForm = form;
        req.flash("error_msg", "That GCash reference number has already been submitted.");
        return res.redirect("/checkout");
      }

      transaction = await sequelize.transaction();
      const checkout = await loadCheckoutCart(req.user.id, transaction);
      if (!checkout || checkout.items.length === 0) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "Your cart is empty.");
        return res.redirect("/cart");
      }
      if (!checkout.available) {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "One or more products are no longer available. Update your cart before ordering.");
        return res.redirect("/cart");
      }
      if (!isValidCheckoutQuote(req.body.quoteToken, checkout)) {
        await transaction.rollback();
        transaction = null;
        req.session.checkoutForm = form;
        req.flash("error_msg", "Your cart changed after checkout loaded. Review the updated prices and confirm again.");
        return res.redirect("/checkout");
      }

      const order = await Order.create({
        order_number: orderNumber(),
        user_id: req.user.id,
        customer_name: form.customerName,
        phone: form.phone,
        order_type: form.orderType,
        delivery_address: form.orderType === "delivery" ? form.deliveryAddress : null,
        pickup_instructions: form.orderType === "pickup" ? paymentDetails.pickupInstructions : null,
        total_amount: formatCents(checkout.totalCents),
        status: "pending",
        terms_accepted: true,
        order_confirmed: true,
      }, { transaction });

      await OrderItem.bulkCreate(checkout.items.map(item => {
        const product = item.product;
        const unitPriceCents = toCents(product.price);
        return {
          order_id: order.id,
          product_id: product.id,
          product_name: product.product_name,
          product_image: product.image,
          unit_price: formatCents(unitPriceCents),
          quantity: item.quantity,
          subtotal: formatCents(unitPriceCents * item.quantity),
        };
      }), { transaction });

      await Payment.create({
        order_id: order.id,
        method: "GCash",
        reference_code: referenceCode,
        amount: formatCents(checkout.totalCents),
        status: "pending",
      }, { transaction });

      await CartItem.destroy({ where: { cart_id: checkout.cart.id }, transaction });
      checkout.cart.status = "ordered";
      await checkout.cart.save({ transaction });

      await transaction.commit();
      transaction = null;
      res.redirect(`/orders/${encodeURIComponent(order.order_number)}`);
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      if (error.name === "SequelizeUniqueConstraintError") {
        req.session.checkoutForm = form;
        req.flash("error_msg", "That reference number or order number was already used. Please review and submit again.");
        return res.redirect("/checkout");
      }
      console.error("Unable to create order:", error.message);
      req.flash("error_msg", "Unable to place your order. Your cart has not been cleared; please try again.");
      res.redirect("/checkout");
    }
  },

  orderConfirmation: async (req, res) => {
    try {
      const order = await Order.findOne({
        where: { order_number: req.params.orderNumber, user_id: req.user.id },
        include: [
          { model: OrderItem, as: "items" },
          { model: Payment, as: "payment" },
        ],
      });
      if (!order) {
        return res.status(404).render("not-found", {
          title: "ServeSync | Order not found",
          hideGuestAuth: true,
        });
      }

      const details = order.get({ plain: true });
      details.isDelivery = details.order_type === "delivery";
      details.paymentIsPending = details.payment.status === "pending";
      details.total = Number(details.total_amount).toFixed(2);
      details.items = details.items.map(item => ({
        ...item,
        unitPrice: Number(item.unit_price).toFixed(2),
        lineTotal: Number(item.subtotal).toFixed(2),
      }));
      details.payment.amount = Number(details.payment.amount).toFixed(2);
      res.render("order-confirmation", {
        title: `ServeSync | Order ${details.order_number}`,
        order: details,
      });
    } catch (error) {
      console.error("Unable to load order confirmation:", error.message);
      res.status(500).render("not-found", {
        title: "ServeSync | Order unavailable",
        hideGuestAuth: true,
      });
    }
  },

  adminPaymentReview: async (req, res) => {
    try {
      const payments = await Payment.findAll({
        where: { status: "pending" },
        include: [{
          model: Order,
          as: "order",
          include: [{
            model: OrderItem,
            as: "items",
          }],
        }],
        order: [["created_at", "ASC"]],
      });

      res.render("admin-payments", {
        title: "ServeSync | GCash payment review",
        payments: payments.map(payment => {
          const details = payment.get({ plain: true });
          details.amount = Number(details.amount).toFixed(2);
          details.order.total_amount = Number(details.order.total_amount).toFixed(2);
          return details;
        }),
      });
    } catch (error) {
      console.error("Unable to load payment review:", error.message);
      res.status(500).render("not-found", {
        title: "ServeSync | Payment review unavailable",
        hideGuestAuth: true,
      });
    }
  },

  verifyPayment: async (req, res) => {
    let transaction;
    const paymentId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    if (!Number.isSafeInteger(paymentId) || paymentId < 1) {
      req.flash("error_msg", "Payment record not found.");
      return res.redirect("/admin/payments");
    }

    try {
      transaction = await sequelize.transaction();
      const payment = await Payment.findByPk(paymentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!payment || payment.status !== "pending") {
        await transaction.rollback();
        transaction = null;
        req.flash("error_msg", "This payment is no longer awaiting verification.");
        return res.redirect("/admin/payments");
      }

      payment.status = "verified";
      payment.verified_by = req.user.id;
      payment.verified_at = new Date();
      await payment.save({ transaction });
      await transaction.commit();
      transaction = null;
      req.flash("success_msg", "Payment marked verified after manual GCash review.");
      res.redirect("/admin/payments");
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Unable to verify payment:", error.message);
      req.flash("error_msg", "Unable to update payment status. Please try again.");
      res.redirect("/admin/payments");
    }
  },
};

export { cartController };