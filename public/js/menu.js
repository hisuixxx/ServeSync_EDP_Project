document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-description]").forEach((description) => {
    const toggle = description.parentElement.querySelector("[data-see-more]");
    if (!toggle) return;

    requestAnimationFrame(() => {
      if (description.scrollHeight > description.clientHeight + 1) toggle.hidden = false;
    });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      const expanded = description.classList.toggle("is-expanded");
      toggle.textContent = expanded ? "See less" : "See more";
      toggle.setAttribute("aria-expanded", String(expanded));
    });
  });
});
