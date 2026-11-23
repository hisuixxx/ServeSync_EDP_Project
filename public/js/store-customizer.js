document.addEventListener("DOMContentLoaded", () => {
  const previewText = {
    headline: document.querySelector("[data-preview-headline]"),
    subtitle: document.querySelector("[data-preview-subtitle]"),
    cta: document.querySelector("[data-preview-cta]"),
  };
  const previewImages = [
    document.querySelector("[data-storefront-preview-image]"),
    document.querySelector("[data-editor-image-preview]"),
  ].filter(Boolean);

  document.querySelectorAll("[data-preview-input]").forEach((input) => {
    const key = input.dataset.previewInput;
    input.addEventListener("input", () => {
      if (key === "image") {
        const value = input.value.trim();
        if (!value || (!value.startsWith("/uploads/") && !/^https?:\/\//i.test(value))) return;
        previewImages.forEach((image) => {
          image.hidden = false;
          image.src = value;
        });
        return;
      }
      if (previewText[key]) previewText[key].textContent = input.value;
    });
  });
});
