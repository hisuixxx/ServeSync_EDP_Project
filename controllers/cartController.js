import { Cart, CartItem, Product, Category } from "../models/associations.js";
import { sequelize } from "../models/db.js";

const parseQuantity = value => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 && n <= 99 ? n : null; };
const message = (req, text, type = "error") => { req.flash(type === "success" ? "success_msg" : "error_msg", text); };

const cartController = {
  cartPage: async (req, res) => {
    try {
      const cart = await Cart.findOne({ where: { user_id: req.user.id, status: "active" }, include: [{ model: CartItem, as: "items", include: [{ model: Product, as: "product", include: [{ model: Category, as: "category" }] }] }] });
      const items = (cart?.items || []).map(item => ({ id: item.id, product_id: item.product_id, product_name: item.product?.product_name || "Unavailable product", product_image: item.product?.image, category_name: item.product?.category?.category_name || "", isAvailable: Boolean(item.product && item.product.status === "active" && item.product.availability), quantity: item.quantity, canDecrease: item.quantity > 1, price: Number(item.product?.price ?? item.price).toFixed(2), lineTotal: (Number(item.product?.price ?? item.price) * item.quantity).toFixed(2) }));
      const total = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
      res.render("customer/cart", { title: "ServeSync | Your Cart", cart: items, cartTotal: total.toFixed(2), canCheckout: items.length > 0 && items.every(item => item.isAvailable) });
    } catch (error) { console.error(error); res.status(500).send("Unable to load your cart."); }
  },
  addToCart: async (req, res) => {
    const quantity = parseQuantity(req.body.quantity || 1); const productId = Number(req.params.id);
    if (!quantity || !Number.isSafeInteger(productId) || productId < 1) { message(req, "Enter a valid quantity."); return res.redirect(`/menu/${req.params.id}`); }
    const tx = await sequelize.transaction();
    try {
      const product = await Product.findOne({ where: { id: productId, status: "active", availability: true }, include: [{ model: Category, as: "category", where: { status: "active" } }], transaction: tx, lock: tx.LOCK.UPDATE });
      if (!product) throw new Error("This item is unavailable.");
      let cart = await Cart.findOne({ where: { user_id: req.user.id, status: "active" }, transaction: tx, lock: tx.LOCK.UPDATE });
      if (!cart) cart = await Cart.create({ user_id: req.user.id, status: "active" }, { transaction: tx });
      const existing = await CartItem.findOne({ where: { cart_id: cart.id, product_id: product.id }, transaction: tx, lock: tx.LOCK.UPDATE });
      if (existing) await existing.update({ quantity: existing.quantity + quantity, price: product.price }, { transaction: tx });
      else await CartItem.create({ cart_id: cart.id, product_id: product.id, quantity, price: product.price }, { transaction: tx });
      await tx.commit(); message(req, `${product.product_name} added to your cart.`, "success"); res.redirect("/cart");
    } catch (error) { if (!tx.finished) await tx.rollback(); message(req, error.message || "Unable to add item."); res.redirect(`/menu/${productId}`); }
  },
  increaseCartItem: async (req, res) => changeCartItem(req, res, 1),
  decreaseCartItem: async (req, res) => changeCartItem(req, res, -1),
  removeCartItem: async (req, res) => {
    try { const item = await CartItem.findOne({ where: { id: req.params.id }, include: [{ model: Cart, as: "cart", where: { user_id: req.user.id, status: "active" } }] }); if (!item) { message(req, "Cart item not found."); return res.redirect("/cart"); } await item.destroy(); message(req, "Item removed from cart.", "success"); res.redirect("/cart"); }
    catch (error) { console.error(error); message(req, "Unable to remove item."); res.redirect("/cart"); }
  },
};
async function changeCartItem(req, res, amount) {
  try { const item = await CartItem.findOne({ where: { id: req.params.id }, include: [{ model: Cart, as: "cart", where: { user_id: req.user.id, status: "active" } }] }); if (!item) { message(req, "Cart item not found."); return res.redirect("/cart"); }
    const next = item.quantity + amount; if (next < 1 || next > 99) { message(req, "Quantity must be between 1 and 99."); return res.redirect("/cart"); }
    await item.update({ quantity: next }); message(req, "Cart updated.", "success"); res.redirect("/cart");
  } catch (error) { console.error(error); message(req, "Unable to update cart."); res.redirect("/cart"); }
}
export { cartController };
