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
    */import { Op } from "sequelize";
import { Product, Category } from "../models/associations.js";

export const productcontroller = {
  // Display all available menu products
  menu: async (req, res) => {
    try {
      const search = String(req.query.search || "").trim();
      const categoryId = req.query.category || "";

      const where = {
        status: "active",
        availability: true
      };

      if (search) {
        where[Op.or] = [
          { product_name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      if (categoryId) {
        where.category_id = Number(categoryId);
      }

      const [products, categories] = await Promise.all([
        Product.findAll({
          where,
          include: [{ model: Category, as: "category" }],
          order: [["product_name", "ASC"]]
        }),
        Category.findAll({
          where: { status: "active" },
          order: [["category_name", "ASC"]]
        })
      ]);

      res.render("menu", {
        title: "ServeSync | Explore Menu",
        products: products.map(p => p.get({ plain: true })),
        categories: categories.map(c => c.get({ plain: true })),
        search,
        selectedCategory: categoryId
      });
    } catch (error) {
      console.error("Menu loading error:", error);
      res.status(500).send("Unable to load the menu.");
    }
  },

  // Display individual product details
  detail: async (req, res) => {
    try {
      const product = await Product.findOne({
        where: {
          id: req.params.id,
          status: "active"
        },
        include: [{ model: Category, as: "category" }]
      });

      if (!product) {
        return res.status(404).render("not-found", {
          title: "ServeSync | Product Not Found"
        });
      }

      res.render("product", {
        title: `ServeSync | ${product.product_name}`,
        product: product.get({ plain: true })
      });
    } catch (error) {
      console.error("Product detail error:", error);
      res.status(500).send("Unable to load product details.");
    }
  }
};