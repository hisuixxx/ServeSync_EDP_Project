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

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
import { Op } from "sequelize";
import { Category, Product } from "../models/associations.js";

const productcontroller = {
  menu: async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const categoryId = Number.parseInt(req.query.category, 10);
    const productWhere = {
      status: "active",
      ...(search ? {
        [Op.or]: [
          { product_name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
        ],
      } : {}),
      ...(Number.isInteger(categoryId) ? { category_id: categoryId } : {}),
    };

    try {
      const [products, categories] = await Promise.all([
        Product.findAll({
          where: productWhere,
          include: [{
            model: Category,
            as: "category",
            where: { status: "active" },
            required: true,
          }],
          order: [["product_name", "ASC"]],
        }),
        Category.findAll({
          where: { status: "active" },
          order: [["category_name", "ASC"]],
        }),
      ]);

      res.render("menu", {
        title: "ServeSync | Explore the menu",
        hideGuestAuth: true,
        products: products.map(product => product.get({ plain: true })),
        categories: categories.map(category => category.get({ plain: true })),
        search,
        selectedCategory: Number.isInteger(categoryId) ? categoryId : "",
      });
    } catch (error) {
      console.error("Unable to load public menu:", error.message);
      res.status(503).render("menu", {
        title: "ServeSync | Explore the menu",
        hideGuestAuth: true,
        products: [],
        categories: [],
        search,
        selectedCategory: "",
        menuError: "The menu is temporarily unavailable. Please try again shortly.",
      });
    }
  },

  detail: async (req, res) => {
    try {
      const product = await Product.findOne({
        where: { id: req.params.id, status: "active" },
        include: [{
          model: Category,
          as: "category",
          where: { status: "active" },
          required: true,
        }],
      });

      if (!product) return res.status(404).render("not-found", { title: "ServeSync | Item not found" });

      res.render("product", {
        title: `ServeSync | ${product.product_name}`,
        hideGuestAuth: true,
        product: product.get({ plain: true }),
      });
    } catch (error) {
      console.error("Unable to load product:", error.message);
      res.status(503).render("not-found", { title: "ServeSync | Item unavailable", hideGuestAuth: true });
    }
  },
};
export { productcontroller };