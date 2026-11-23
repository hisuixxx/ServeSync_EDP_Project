document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("table[data-table]").forEach((table) => {
    const wrapper = table.closest(".ss-table-wrap") || table.parentElement;
    const search = wrapper.parentElement.querySelector("[data-table-search]") || document.createElement("input");
    if (!search.hasAttribute("data-table-search")) {
      search.type = "search";
      search.placeholder = "Search this table…";
      search.className = "ss-table-search";
      search.setAttribute("aria-label", "Search table");
      wrapper.parentElement.insertBefore(search, wrapper);
    }

    const pager = document.createElement("div");
    pager.className = "ss-table-pager";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.className = "ss-small-button";
    const info = document.createElement("span");
    info.className = "ss-muted";
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.className = "ss-small-button";
    pager.append(previous, info, next);
    wrapper.after(pager);

    const tbody = table.querySelector("tbody");
    let page = 0;
    const pageSize = 10;
    let rows = [...(tbody?.querySelectorAll("tr") || [])].filter((row) => !row.querySelector("td[colspan]"));
    const render = () => {
      const visible = rows.filter((row) => row.dataset.searchMatch !== "false");
      const pages = Math.max(1, Math.ceil(visible.length / pageSize));
      page = Math.min(page, pages - 1);
      rows.forEach((row) => { row.hidden = row.dataset.searchMatch === "false"; });
      visible.forEach((row, index) => { row.hidden = index < page * pageSize || index >= (page + 1) * pageSize; });
      const empty = wrapper.parentElement.querySelector(".ss-table-empty");
      if (empty) empty.hidden = visible.length > 0;
      info.textContent = visible.length ? `Page ${page + 1} of ${pages} · ${visible.length} records` : "No matching records";
      previous.disabled = page <= 0;
      next.disabled = page >= pages - 1;
    };

    search.addEventListener("input", () => {
      const term = search.value.trim().toLocaleLowerCase();
      rows.forEach((row) => { row.dataset.searchMatch = row.textContent.toLocaleLowerCase().includes(term) ? "true" : "false"; });
      page = 0;
      render();
    });
    previous.addEventListener("click", () => { page = Math.max(0, page - 1); render(); });
    next.addEventListener("click", () => { page += 1; render(); });

    table.querySelectorAll("thead th").forEach((th, index) => {
      th.style.cursor = "pointer";
      th.title = "Click to sort";
      th.addEventListener("click", () => {
        const ascending = th.dataset.sort !== "asc";
        table.querySelectorAll("th").forEach((cell) => delete cell.dataset.sort);
        th.dataset.sort = ascending ? "asc" : "desc";
        rows.sort((a, b) => {
          const left = a.children[index]?.innerText.trim() || "";
          const right = b.children[index]?.innerText.trim() || "";
          const leftNumber = Number(left.replace(/[^0-9.-]/g, ""));
          const rightNumber = Number(right.replace(/[^0-9.-]/g, ""));
          const comparison = left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
            ? leftNumber - rightNumber
            : left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
          return ascending ? comparison : -comparison;
        });
        rows.forEach((row) => tbody.appendChild(row));
        page = 0;
        render();
      });
    });
    render();
  });
});
