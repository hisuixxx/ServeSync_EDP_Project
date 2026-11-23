
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
import { Product, Category } from "../models/associations.js";
import { getStorefrontSettings } from "../models/StorefrontSetting.js";

export const homePage = async (req, res) => {
  try {
    const settings = await getStorefrontSettings();
    const featuredIds = Array.isArray(settings.featured_product_ids) ? settings.featured_product_ids.map(Number).filter(Number.isSafeInteger) : [];
    const hiddenIds = Array.isArray(settings.hidden_product_ids) ? settings.hidden_product_ids.map(Number).filter(Number.isSafeInteger) : [];
    const visibleFeaturedIds = featuredIds.filter(id => !hiddenIds.includes(id)).slice(0, 4);
    const products = visibleFeaturedIds.length
      ? await Product.findAll({ where: { id: visibleFeaturedIds, status: "active", availability: true }, include: [{ model: Category, as: "category" }], limit: 4 })
      : [];
    const productMap = new Map(products.map(product => [product.id, product.get({ plain: true })]));
    const featuredProducts = visibleFeaturedIds.map(id => productMap.get(id)).filter(Boolean);
    res.render("home", {
      title: "ServeSync | Digital dining, made simple",
      storefrontSettings: settings,
      featuredProducts,
    });
  } catch (error) {
    console.error("Landing page loading error:", error);
    res.status(500).send("Unable to load the landing page.");
  }
};
