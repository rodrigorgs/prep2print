const state = {
  templates: [],
  selectedId: null,
  sheet: [],
  selection: null,
  isSelecting: false,
};

const columns = ["File name", "Cards", "Page size", "ViewBox", "Status"];
const sheetRows = 12;
const sheetCols = columns.length;

const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const templateList = document.querySelector("#templateList");
const templateCount = document.querySelector("#templateCount");
const previewTitle = document.querySelector("#previewTitle");
const previewMeta = document.querySelector("#previewMeta");
const svgPreview = document.querySelector("#svgPreview");
const projectSheetBody = document.querySelector("#projectSheet tbody");
const exportYamlButton = document.querySelector("#exportYamlButton");

function initSheet() {
  state.sheet = Array.from({ length: sheetRows }, (_, rowIndex) =>
    Array.from({ length: sheetCols }, (_, colIndex) =>
      rowIndex === 0 ? columns[colIndex] : "",
    ),
  );
  renderSheet();
}

function parseSvgFile(file, text) {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(text, "image/svg+xml");
  const parserError = documentSvg.querySelector("parsererror");

  if (parserError) {
    throw new Error("The SVG could not be parsed.");
  }

  const svg = documentSvg.querySelector("svg");
  if (!svg) {
    throw new Error("The file does not contain an SVG root element.");
  }

  const images = Array.from(svg.querySelectorAll("image"));
  const width = svg.getAttribute("width") || "";
  const height = svg.getAttribute("height") || "";
  const viewBox = svg.getAttribute("viewBox") || "";

  return {
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    fileName: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    imageCount: images.length,
    width,
    height,
    viewBox,
    svgText: text,
  };
}

async function handleFiles(files) {
  const svgFiles = Array.from(files).filter((file) =>
    file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml",
  );

  for (const file of svgFiles) {
    const text = await file.text();
    try {
      const template = parseSvgFile(file, text);
      state.templates.push(template);
      upsertTemplateRow(template);
      state.selectedId = template.id;
    } catch (error) {
      state.templates.push({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        fileName: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        imageCount: 0,
        width: "",
        height: "",
        viewBox: "",
        svgText: "",
        error: error.message,
      });
    }
  }

  renderTemplates();
  renderSheet();
  renderPreview();
  exportYamlButton.disabled = state.templates.length === 0;
}

function upsertTemplateRow(template) {
  let nextRow = state.sheet.findIndex(
    (row, index) => index > 0 && row.every((cell) => !cell),
  );

  if (nextRow === -1) {
    state.sheet.push(Array.from({ length: sheetCols }, () => ""));
    nextRow = state.sheet.length - 1;
  }

  state.sheet[nextRow] = [
    template.fileName,
    String(template.imageCount),
    [template.width, template.height].filter(Boolean).join(" x "),
    template.viewBox,
    template.error ? `Error: ${template.error}` : "Ready",
  ];
}

function renderTemplates() {
  templateCount.textContent = `${state.templates.length} ${
    state.templates.length === 1 ? "file" : "files"
  }`;
  templateList.innerHTML = "";

  if (!state.templates.length) {
    templateList.className = "template-list empty";
    templateList.innerHTML = "<p>No SVG templates uploaded yet.</p>";
    return;
  }

  templateList.className = "template-list";
  for (const template of state.templates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `template-card${template.id === state.selectedId ? " is-selected" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(template.fileName)}</strong>
      <span class="badge">${template.imageCount} cards</span>
      <span>${template.width || "unknown"} x ${template.height || "unknown"}</span>
      <span>${formatBytes(template.size)}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedId = template.id;
      renderTemplates();
      renderPreview();
    });
    templateList.append(button);
  }
}

function renderPreview() {
  const selected = state.templates.find((template) => template.id === state.selectedId);

  if (!selected) {
    previewTitle.textContent = "No template selected";
    previewMeta.textContent = "Upload an SVG to inspect the print sheet.";
    svgPreview.innerHTML = '<div class="empty-preview">SVG preview</div>';
    return;
  }

  previewTitle.textContent = selected.fileName;
  previewMeta.textContent = `${selected.imageCount} cards · ${
    [selected.width, selected.height].filter(Boolean).join(" x ") || "unknown page size"
  }`;

  if (selected.error) {
    svgPreview.innerHTML = `<div class="empty-preview">${escapeHtml(selected.error)}</div>`;
    return;
  }

  const sanitized = sanitizeSvgForPreview(selected.svgText);
  svgPreview.innerHTML = sanitized;
  const svg = svgPreview.querySelector("svg");
  if (svg) {
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", selected.fileName);
  }
}

function sanitizeSvgForPreview(svgText) {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(svgText, "image/svg+xml");

  for (const tagName of ["script", "foreignObject"]) {
    for (const node of documentSvg.querySelectorAll(tagName)) {
      node.remove();
    }
  }

  for (const element of documentSvg.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return new XMLSerializer().serializeToString(documentSvg.documentElement);
}

function renderSheet() {
  projectSheetBody.innerHTML = "";

  state.sheet.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    const rowHead = document.createElement("th");
    rowHead.textContent = String(rowIndex + 1);
    tr.append(rowHead);

    for (let colIndex = 0; colIndex < sheetCols; colIndex += 1) {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.spellcheck = false;
      td.dataset.row = String(rowIndex);
      td.dataset.col = String(colIndex);
      td.textContent = row[colIndex] ?? "";
      td.addEventListener("focus", selectCell);
      td.addEventListener("mousedown", beginSelection);
      td.addEventListener("mouseenter", extendSelection);
      td.addEventListener("input", updateCell);
      td.addEventListener("paste", pasteCells);
      tr.append(td);
    }

    projectSheetBody.append(tr);
  });
}

function selectCell(event) {
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);

  if (!state.selection) {
    state.selection = { startRow: row, startCol: col, endRow: row, endCol: col };
  }

  paintSelection();
}

function beginSelection(event) {
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);

  state.isSelecting = true;

  if (event.shiftKey && state.selection) {
    state.selection.endRow = row;
    state.selection.endCol = col;
  } else {
    state.selection = { startRow: row, startCol: col, endRow: row, endCol: col };
  }

  paintSelection();
}

function extendSelection(event) {
  if (!state.isSelecting || !state.selection) {
    return;
  }

  state.selection.endRow = Number(event.currentTarget.dataset.row);
  state.selection.endCol = Number(event.currentTarget.dataset.col);
  paintSelection();
}

function endSelection() {
  state.isSelecting = false;
}

function paintSelection() {
  document.querySelectorAll(".sheet td.is-selected").forEach((cell) => {
    cell.classList.remove("is-selected");
  });

  if (!state.selection) {
    return;
  }

  const range = normalizeSelection(state.selection);

  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      document
        .querySelector(`.sheet td[data-row="${row}"][data-col="${col}"]`)
        ?.classList.add("is-selected");
    }
  }
}

function normalizeSelection(selection) {
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol),
  };
}

function updateCell(event) {
  const { row, col } = event.currentTarget.dataset;
  state.sheet[Number(row)][Number(col)] = event.currentTarget.textContent;
}

function pasteCells(event) {
  const text = event.clipboardData.getData("text/plain");
  if (!text.includes("\t") && !text.includes("\n")) {
    return;
  }

  event.preventDefault();
  const startRow = Number(event.currentTarget.dataset.row);
  const startCol = Number(event.currentTarget.dataset.col);
  const rows = text.replace(/\r/g, "").split("\n").filter((row) => row.length);

  rows.forEach((rowText, rowOffset) => {
    const cells = rowText.split("\t");
    const targetRow = startRow + rowOffset;

    while (state.sheet.length <= targetRow) {
      state.sheet.push(Array.from({ length: sheetCols }, () => ""));
    }

    cells.forEach((cellText, colOffset) => {
      const targetCol = startCol + colOffset;
      if (targetCol < sheetCols) {
        state.sheet[targetRow][targetCol] = cellText;
      }
    });
  });

  renderSheet();
  paintSelection();
  const nextCell = document.querySelector(
    `.sheet td[data-row="${startRow}"][data-col="${startCol}"]`,
  );
  nextCell?.focus();
}

function copySelection(event) {
  if (!state.selection) {
    return;
  }

  const range = normalizeSelection(state.selection);
  const text = [];

  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const cells = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      cells.push(state.sheet[row]?.[col] ?? "");
    }
    text.push(cells.join("\t"));
  }

  event.clipboardData.setData("text/plain", text.join("\n"));
  event.preventDefault();
}

function exportYaml() {
  const yaml = toYaml({
    app: "Prep2Print",
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: state.templates.map((template) => ({
      fileName: template.fileName,
      size: template.size,
      imageCount: template.imageCount,
      width: template.width,
      height: template.height,
      viewBox: template.viewBox,
      uploadedAt: template.uploadedAt,
      svg: template.svgText,
    })),
    sheet: state.sheet,
  });
  downloadFile("prep2print-project.yaml", yaml, "application/x-yaml");
}

function toYaml(value, indent = 0) {
  const spaces = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) {
      return "[]";
    }
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const nested = toYaml(item, indent + 2);
          return `${spaces}- ${nested.trimStart()}`;
        }
        return `${spaces}- ${toYaml(item, indent + 2).trimStart()}`;
      })
      .join("\n");
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, item]) => {
        if (isScalar(item)) {
          return `${spaces}${key}: ${formatYamlScalar(item, indent)}`;
        }
        return `${spaces}${key}:\n${toYaml(item, indent + 2)}`;
      })
      .join("\n");
  }

  return formatYamlScalar(value, indent);
}

function isScalar(value) {
  return (
    value === null ||
    ["string", "number", "boolean", "undefined"].includes(typeof value)
  );
}

function formatYamlScalar(value, indent) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === "") {
    return '""';
  }
  if (value.includes("\n") || value.length > 120) {
    const spaces = " ".repeat(indent + 2);
    return `|\n${spaces}${value.replace(/\n/g, `\n${spaces}`)}`;
  }
  if (/[:#,[\]{}]|^\s|\s$|^-|^true$|^false$|^null$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function downloadFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  event.target.value = "";
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  handleFiles(event.dataTransfer.files);
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    fileInput.click();
  }
});

exportYamlButton.addEventListener("click", exportYaml);
document.addEventListener("mouseup", endSelection);
document.addEventListener("copy", copySelection);

initSheet();
renderTemplates();
renderPreview();
