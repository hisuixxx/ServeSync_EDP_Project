import { Product } from "../models/Product.js";

const requireAuthentication = (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
    return false;
  }
  return true;
};

export const addToCart = async (req, res) => {
  if (!requireAuthentication(req, res)) return;

  const product = await Product.findOne({ where: { id: req.params.id, status: "active", availability: true } });
  if (!product) return res.status(404).redirect("/menu");

  const cart = req.session.cart || [];
  const existingItem = cart.find(item => item.productId === product.id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ productId: product.id, quantity: 1 });
  }
  req.session.cart = cart;
  res.redirect("/cart");
};

export const cartPage = async (req, res) => {
  if (!requireAuthentication(req, res)) return;

  const cart = req.session.cart || [];
  const products = cart.length
    ? await Product.findAll({
      where: {
        id: cart.map(item => item.productId),
        status: "active",
      },
    })
    : [];
  const productMap = new Map(products.map(product => [product.id, product.get({ plain: true })]));
  const cartItems = cart
    .map(item => ({
      ...productMap.get(item.productId),
      quantity: item.quantity,
      lineTotal: (Number(productMap.get(item.productId)?.price || 0) * item.quantity).toFixed(2),
    }))
    .filter(item => item.id);
  const cartTotal = cartItems.reduce((total, item) => total + Number(item.lineTotal), 0).toFixed(2);
  const orderConfirmation = req.session.orderConfirmation;
  delete req.session.orderConfirmation;

  res.render("cart", {
    title: "ServeSync | Your cart",
    cart: cartItems,
    cartTotal,
    orderConfirmation,
  });
};

export const placeOrder = (req, res) => {
  if (!requireAuthentication(req, res)) return;

  const paymentMethod = ["GCash", "COD"].includes(req.body.paymentMethod)
    ? req.body.paymentMethod
    : null;

  if (!paymentMethod || !(req.session.cart || []).length) {
    return res.redirect("/cart");
  }

  req.session.cart = [];
  req.session.orderConfirmation = `Order confirmed with ${paymentMethod === "COD" ? "Cash on Delivery" : "GCash"}.`;
  res.redirect("/cart");
};
