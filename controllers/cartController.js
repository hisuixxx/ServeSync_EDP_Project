import { Cart, CartItem, Product, Category } from "../models/associations.js";
import { sequelize } from "../models/db.js";

const parseQuantity = (value) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) ? quantity : null;
};

const cartController = {
  cartPage: async (req, res) => {
    try {
      const cart = await Cart.findOne({
        where: { user_id: req.user.id, status: "active" },
        include: [{
          model: CartItem,
          as: "items",
          include: [{
            model: Product,
            as: "product",
            include: [{ model: Category, as: "category" }],
          }],
        }],
      });

      const cartItems = (cart?.items || []).map((item) => {
        const price = Number(item.price);
        const lineTotal = price * item.quantity;
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product?.product_name || "Unavailable product",
          product_image: item.product?.image,
          category_name: item.product?.category?.category_name || "",
          quantity: item.quantity,
          canDecrease: item.quantity > 1,
          price: price.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        };
      });
      const cartTotal = cartItems.reduce((total, item) => total + Number(item.lineTotal), 0);

      res.render("cart", {
        title: "ServeSync | Your Cart",
        cart: cartItems,
        cartTotal: cartTotal.toFixed(2),
        orderConfirmation: req.session.orderConfirmation || null,
        cartMessage: req.session.cartMessage || null,
        cartMessageType: req.session.cartMessageType || "error",
      });
      delete req.session.orderConfirmation;
      delete req.session.cartMessage;
      delete req.session.cartMessageType;
    } catch (error) {
      console.error("Error loading cart:", error.message);
      res.status(500).render("cart", {
        title: "ServeSync | Your Cart",
        cart: [],
        cartTotal: "0.00",
        cartMessage: "Unable to load your cart. Please try again.",
        cartMessageType: "error",
      });
    }
  },

  addToCart: async (req, res) => {
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) {
      req.session.cartMessage = "Enter a valid quantity greater than zero.";
      req.session.cartMessageType = "error";
      return res.redirect(`/menu/${req.params.id}`);
    }

    let transaction;
    try {
      const productId = Number(req.params.id);
      if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(404).render("not-found", { title: "ServeSync | Item not found" });
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
        req.session.cartMessage = "This item is unavailable and cannot be added to your cart.";
        req.session.cartMessageType = "error";
        return res.redirect(`/menu/${productId}`);
      }

      let cart = await Cart.findOne({
        where: { user_id: req.user.id, status: "active" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!cart) {
        cart = await Cart.create({ user_id: req.user.id, status: "active" }, { transaction });
      }

      const cartItem = await CartItem.findOne({
        where: { cart_id: cart.id, product_id: product.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (cartItem) {
        const updatedQuantity = cartItem.quantity + quantity;
        if (!Number.isSafeInteger(updatedQuantity)) {
          await transaction.rollback();
          req.session.cartMessage = "That quantity is too large.";
          req.session.cartMessageType = "error";
          return res.redirect(`/menu/${productId}`);
        }
        cartItem.quantity = updatedQuantity;
        cartItem.price = product.price;
        await cartItem.save({ transaction });
      } else {
        await CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity,
          price: product.price,
        }, { transaction });
      }

      await transaction.commit();
      req.session.cartMessage = `${product.product_name} added to your cart.`;
      req.session.cartMessageType = "success";
      res.redirect("/cart");
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error adding to cart:", error.message);
      req.session.cartMessage = "Unable to add this item to your cart. Please try again.";
      req.session.cartMessageType = "error";
      res.redirect(`/menu/${req.params.id}`);
    }
  },

  increaseCartItem: async (req, res) => changeCartItem(req, res, 1),
  decreaseCartItem: async (req, res) => changeCartItem(req, res, -1),

  removeCartItem: async (req, res) => {
    try {
      const cartItem = await CartItem.findOne({
        where: { id: req.params.id },
        include: [{
          model: Cart,
          as: "cart",
          where: { user_id: req.user.id, status: "active" },
          required: true,
        }],
      });

      if (!cartItem) {
        req.session.cartMessage = "Cart item not found.";
        req.session.cartMessageType = "error";
      } else {
        await cartItem.destroy();
        req.session.cartMessage = "Item removed from your cart.";
        req.session.cartMessageType = "success";
      }
      res.redirect("/cart");
    } catch (error) {
      console.error("Error removing cart item:", error.message);
      req.session.cartMessage = "Unable to remove the item. Please try again.";
      req.session.cartMessageType = "error";
      res.redirect("/cart");
    }
  },

  placeOrder: async (req, res) => {
    let transaction;
    try {
      transaction = await sequelize.transaction();
      const cart = await Cart.findOne({
        where: { user_id: req.user.id, status: "active" },
        include: [{
          model: CartItem,
          as: "items",
          include: [{
            model: Product,
            as: "product",
            where: { status: "active", availability: true },
            required: true,
          }],
        }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!cart || cart.items.length === 0) {
        await transaction.rollback();
        req.session.cartMessage = "Your cart is empty or contains unavailable items.";
        req.session.cartMessageType = "error";
        return res.redirect("/cart");
      }

      cart.status = "ordered";
      await cart.save({ transaction });
      await transaction.commit();
      req.session.orderConfirmation = "Your order is ready for the next step.";
      res.redirect("/cart");
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error proceeding with cart:", error.message);
      req.session.cartMessage = "Unable to proceed with your cart. Please try again.";
      req.session.cartMessageType = "error";
      res.redirect("/cart");
    }
  },
};

async function changeCartItem(req, res, amount) {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
      req.session.cartMessage = "Cart item not found.";
      req.session.cartMessageType = "error";
      return res.redirect("/cart");
    }

    const cartItem = await CartItem.findOne({
      where: { id: itemId },
      include: [{
        model: Cart,
        as: "cart",
        where: { user_id: req.user.id, status: "active" },
        required: true,
      }],
    });

    if (!cartItem) {
      req.session.cartMessage = "Cart item not found.";
      req.session.cartMessageType = "error";
    } else if (cartItem.quantity + amount < 1) {
      req.session.cartMessage = "Quantity cannot be lower than one. Remove the item instead.";
      req.session.cartMessageType = "error";
    } else if (!Number.isSafeInteger(cartItem.quantity + amount)) {
      req.session.cartMessage = "That quantity is too large.";
      req.session.cartMessageType = "error";
    } else {
      cartItem.quantity += amount;
      await cartItem.save();
      req.session.cartMessage = "Cart quantity updated.";
      req.session.cartMessageType = "success";
    }
    res.redirect("/cart");
  } catch (error) {
    console.error("Error updating cart quantity:", error.message);
    req.session.cartMessage = "Unable to update the cart quantity. Please try again.";
    req.session.cartMessageType = "error";
    res.redirect("/cart");
  }
}

export { cartController };
