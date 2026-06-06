const assetColumns = ["File Name", "Rows", "Columns", "Images"];

const state = {
  currentStep: "templates",
  templates: [],
  selectedTemplateId: null,
  assets: [],
  selectedAssetId: null,
  confirmedAssets: false,
  sheets: {
    assets: createSheet(assetColumns, 0),
  },
  selection: null,
  isSelecting: false,
};

const elements = {
  stepViews: document.querySelectorAll("[data-step]"),
  stepButtons: document.querySelectorAll("[data-step-button]"),
  templateFileInput: document.querySelector("#templateFileInput"),
  templateDropZone: document.querySelector("#templateDropZone"),
  templateList: document.querySelector("#templateList"),
  templateCount: document.querySelector("#templateCount"),
  continueToAssetsButton: document.querySelector("#continueToAssetsButton"),
  previewTitle: document.querySelector("#previewTitle"),
  previewMeta: document.querySelector("#previewMeta"),
  svgPreview: document.querySelector("#svgPreview"),
  assetFileInput: document.querySelector("#assetFileInput"),
  assetDropZone: document.querySelector("#assetDropZone"),
  assetList: document.querySelector("#assetList"),
  assetCount: document.querySelector("#assetCount"),
  continueToConfigureButton: document.querySelector("#continueToConfigureButton"),
  assetUploadTitle: document.querySelector("#assetUploadTitle"),
  assetUploadMeta: document.querySelector("#assetUploadMeta"),
  assetUploadPreview: document.querySelector("#assetUploadPreview"),
  assetSheet: document.querySelector("#assetSheet"),
  assetConfigTitle: document.querySelector("#assetConfigTitle"),
  assetConfigMeta: document.querySelector("#assetConfigMeta"),
  assetConfigPreview: document.querySelector("#assetConfigPreview"),
  confirmAssetsButton: document.querySelector("#confirmAssetsButton"),
  exportYamlButton: document.querySelector("#exportYamlButton"),
};

function createSheet(columns, minRows) {
  return Array.from({ length: minRows }, () => Array.from({ length: columns.length }, () => ""));
}

function setStep(step) {
  if (!canOpenStep(step)) {
    return;
  }

  state.currentStep = step;
  state.selection = null;

  elements.stepViews.forEach((view) => {
    const isActive = view.dataset.step === step;
    view.classList.toggle("is-active", isActive);
    view.hidden = !isActive;
  });

  elements.stepButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stepButton === step);
  });

  renderAll();
}

function canOpenStep(step) {
  if (step === "templates") {
    return true;
  }
  if (step === "assets") {
    return state.templates.length > 0;
  }
  return state.assets.length > 0;
}

function updateStepAvailability() {
  elements.stepButtons.forEach((button) => {
    const step = button.dataset.stepButton;
    button.disabled = !canOpenStep(step);
  });
  elements.continueToAssetsButton.disabled = state.templates.length === 0;
  elements.continueToConfigureButton.disabled = state.assets.length === 0;
  elements.confirmAssetsButton.disabled = state.assets.length === 0;
  elements.exportYamlButton.disabled = state.templates.length === 0 && state.assets.length === 0;
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
    id: crypto.randomUUID(),
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

async function handleTemplateFiles(files) {
  const svgFiles = Array.from(files).filter((file) =>
    file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml",
  );

  for (const file of svgFiles) {
    const text = await file.text();
    try {
      const template = parseSvgFile(file, text);
      state.templates.push(template);
      state.selectedTemplateId = template.id;
    } catch (error) {
      const template = {
        id: crypto.randomUUID(),
        fileName: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        imageCount: 0,
        width: "",
        height: "",
        viewBox: "",
        svgText: "",
        error: error.message,
      };
      state.templates.push(template);
      state.selectedTemplateId = template.id;
    }
  }

  renderAll();
}

async function handleAssetFiles(files) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

  if (imageFiles.length) {
    state.confirmedAssets = false;
  }

  for (const file of imageFiles) {
    const dataUrl = await readFileAsDataUrl(file);
    const asset = {
      id: crypto.randomUUID(),
      fileName: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      dataUrl,
      objectUrl: URL.createObjectURL(file),
      rows: 1,
      columns: 1,
      imageCount: 1,
      width: 0,
      height: 0,
      status: "Ready",
    };

    try {
      const dimensions = await loadImageDimensions(asset.objectUrl);
      asset.width = dimensions.width;
      asset.height = dimensions.height;
    } catch (error) {
      asset.status = `Error: ${error.message}`;
    }

    state.assets.push(asset);
    state.selectedAssetId = asset.id;
  }

  syncAssetSheet();
  renderAll();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("The asset could not be read.")));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener("error", () => reject(new Error("The image could not be loaded.")));
    image.src = src;
  });
}

function syncAssetSheet() {
  state.sheets.assets = state.assets.map((asset) => [
    asset.fileName,
    String(asset.rows),
    String(asset.columns),
    String(asset.imageCount),
  ]);
}

function syncAssetFromSheet(rowIndex) {
  const asset = state.assets[rowIndex];
  if (!asset) {
    return;
  }

  const row = state.sheets.assets[rowIndex];
  asset.fileName = row[0] || asset.fileName;
  asset.rows = clampPositiveInteger(row[1], 1);
  asset.columns = clampPositiveInteger(row[2], 1);
  asset.imageCount = clampPositiveInteger(row[3], 1);
  row[1] = String(asset.rows);
  row[2] = String(asset.columns);
  row[3] = String(asset.imageCount);
}

function clampPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function renderAll() {
  updateStepAvailability();
  renderTemplates();
  renderTemplatePreview();
  renderAssetList();
  renderAssetUploadPreview();
  renderSheet(elements.assetSheet, "assets", assetColumns);
  renderAssetConfigPreview();
}

function renderTemplates() {
  elements.templateCount.textContent = `${state.templates.length} ${
    state.templates.length === 1 ? "file" : "files"
  }`;
  elements.templateList.innerHTML = "";

  if (!state.templates.length) {
    elements.templateList.className = "template-list empty";
    elements.templateList.innerHTML = "<p>No SVG templates uploaded yet.</p>";
    return;
  }

  elements.templateList.className = "template-list";
  for (const template of state.templates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `template-card${
      template.id === state.selectedTemplateId ? " is-selected" : ""
    }`;
    button.innerHTML = `
      <strong>${escapeHtml(template.fileName)}</strong>
      <span class="badge">${template.imageCount} cards</span>
      <span>${template.width || "unknown"} x ${template.height || "unknown"}</span>
      <span>${formatBytes(template.size)}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedTemplateId = template.id;
      renderTemplates();
      renderTemplatePreview();
    });
    elements.templateList.append(button);
  }
}

function renderTemplatePreview() {
  const selected = state.templates.find(
    (template) => template.id === state.selectedTemplateId,
  );

  if (!selected) {
    elements.previewTitle.textContent = "No template selected";
    elements.previewMeta.textContent = "Upload an SVG to inspect the print sheet.";
    elements.svgPreview.innerHTML = '<div class="empty-preview">SVG preview</div>';
    return;
  }

  elements.previewTitle.textContent = selected.fileName;
  elements.previewMeta.textContent = `${selected.imageCount} cards · ${
    [selected.width, selected.height].filter(Boolean).join(" x ") || "unknown page size"
  }`;

  if (selected.error) {
    elements.svgPreview.innerHTML = `<div class="empty-preview">${escapeHtml(
      selected.error,
    )}</div>`;
    return;
  }

  elements.svgPreview.innerHTML = sanitizeSvgForPreview(selected.svgText);
  const svg = elements.svgPreview.querySelector("svg");
  if (svg) {
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", selected.fileName);
  }
}

function renderAssetList() {
  elements.assetCount.textContent = `${state.assets.length} ${
    state.assets.length === 1 ? "file" : "files"
  }`;
  elements.assetList.innerHTML = "";

  if (!state.assets.length) {
    elements.assetList.className = "template-list empty";
    elements.assetList.innerHTML = "<p>No image assets uploaded yet.</p>";
    return;
  }

  elements.assetList.className = "template-list";
  for (const asset of state.assets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `template-card${asset.id === state.selectedAssetId ? " is-selected" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(asset.fileName)}</strong>
      <span class="badge">${asset.imageCount} images</span>
      <span>${asset.width && asset.height ? `${asset.width} x ${asset.height}` : "unknown"}</span>
      <span>${formatBytes(asset.size)}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedAssetId = asset.id;
      renderAssetList();
      renderAssetUploadPreview();
      renderAssetConfigPreview();
    });
    elements.assetList.append(button);
  }
}

function renderAssetUploadPreview() {
  const selected = getSelectedAsset();

  if (!selected) {
    elements.assetUploadTitle.textContent = "No asset selected";
    elements.assetUploadMeta.textContent = "Upload image assets to prepare the sheet.";
    elements.assetUploadPreview.innerHTML = '<div class="empty-preview">Asset preview</div>';
    return;
  }

  elements.assetUploadTitle.textContent = selected.fileName;
  elements.assetUploadMeta.textContent = `${formatBytes(selected.size)} · ${
    selected.width && selected.height ? `${selected.width} x ${selected.height}` : "unknown"
  }`;
  elements.assetUploadPreview.innerHTML = `<img alt="${escapeHtml(
    selected.fileName,
  )}" src="${selected.objectUrl}" />`;
}

function renderAssetConfigPreview() {
  const selected = getSelectedAsset();

  if (!selected) {
    elements.assetConfigTitle.textContent = "No asset selected";
    elements.assetConfigMeta.textContent = state.confirmedAssets
      ? "Assets confirmed for the next project step."
      : "Click an asset row to inspect slices.";
    elements.assetConfigPreview.innerHTML =
      '<div class="empty-preview">Sliced asset preview</div>';
    return;
  }

  elements.assetConfigTitle.textContent = selected.fileName;
  elements.assetConfigMeta.textContent = state.confirmedAssets
    ? "Assets confirmed for the next project step."
    : `${selected.rows} rows · ${selected.columns} columns · ${selected.imageCount} visible images`;
  elements.assetConfigPreview.innerHTML = buildAssetGrid(selected);
}

function buildAssetGrid(asset) {
  const cols = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const count = Math.min(asset.imageCount, cols * rows);
  const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
  const tiles = [];

  for (let index = 0; index < rows * cols; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = cols === 1 ? "0%" : `${(col / (cols - 1)) * 100}%`;
    const y = rows === 1 ? "0%" : `${(row / (rows - 1)) * 100}%`;
    const hiddenClass = index >= count ? " is-hidden" : "";
    tiles.push(
      `<div class="asset-tile${hiddenClass}" style="--tile-x: ${x}; --tile-y: ${y};"></div>`,
    );
  }

  return `
    <div
      class="asset-grid"
      style="--grid-cols: ${cols}; --grid-rows: ${rows}; --asset-ratio: ${ratio}; --asset-image: url('${asset.objectUrl.replace(/'/g, "%27")}');"
      role="img"
      aria-label="${escapeHtml(asset.fileName)} sliced preview"
    >
      ${tiles.join("")}
    </div>
  `;
}

function getSelectedAsset() {
  return state.assets.find((asset) => asset.id === state.selectedAssetId);
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

function renderSheet(table, sheetName, columns) {
  renderSheetHeader(table, columns);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";

  state.sheets[sheetName].forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    if (sheetName === "assets" && state.assets[rowIndex]?.id === state.selectedAssetId) {
      tr.classList.add("is-active-row");
    }

    const rowHead = document.createElement("th");
    rowHead.textContent = String(rowIndex + 1);
    tr.append(rowHead);

    columns.forEach((_, colIndex) => {
      const td = document.createElement("td");
      td.contentEditable = sheetName === "assets" ? String(colIndex <= 3) : "true";
      td.spellcheck = false;
      td.dataset.sheet = sheetName;
      td.dataset.row = String(rowIndex);
      td.dataset.col = String(colIndex);
      td.textContent = row[colIndex] ?? "";
      td.addEventListener("focus", selectCell);
      td.addEventListener("mousedown", beginSelection);
      td.addEventListener("mouseenter", extendSelection);
      td.addEventListener("input", updateCell);
      td.addEventListener("paste", pasteCells);
      td.addEventListener("click", handleCellClick);
      tr.append(td);
    });

    tbody.append(tr);
  });
}

function renderSheetHeader(table, columns) {
  const headRow = table.querySelector("thead tr");
  headRow.innerHTML = "<th></th>";

  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.append(th);
  }
}

function handleCellClick(event) {
  const sheetName = event.currentTarget.dataset.sheet;
  const rowIndex = Number(event.currentTarget.dataset.row);

  if (sheetName === "assets" && state.assets[rowIndex]) {
    state.selectedAssetId = state.assets[rowIndex].id;
    renderAssetList();
    renderSheet(elements.assetSheet, "assets", assetColumns);
    renderAssetConfigPreview();
  }
}

function selectCell(event) {
  const cell = event.currentTarget;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  state.selection = {
    sheet: cell.dataset.sheet,
    startRow: row,
    startCol: col,
    endRow: row,
    endCol: col,
  };
  paintSelection();
}

function beginSelection(event) {
  const cell = event.currentTarget;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);

  state.isSelecting = true;

  if (event.shiftKey && state.selection?.sheet === cell.dataset.sheet) {
    state.selection.endRow = row;
    state.selection.endCol = col;
  } else {
    state.selection = {
      sheet: cell.dataset.sheet,
      startRow: row,
      startCol: col,
      endRow: row,
      endCol: col,
    };
  }

  paintSelection();
}

function extendSelection(event) {
  const cell = event.currentTarget;
  if (!state.isSelecting || !state.selection || state.selection.sheet !== cell.dataset.sheet) {
    return;
  }

  state.selection.endRow = Number(cell.dataset.row);
  state.selection.endCol = Number(cell.dataset.col);
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
        .querySelector(
          `.sheet td[data-sheet="${state.selection.sheet}"][data-row="${row}"][data-col="${col}"]`,
        )
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
  const cell = event.currentTarget;
  const sheetName = cell.dataset.sheet;
  const rowIndex = Number(cell.dataset.row);
  const colIndex = Number(cell.dataset.col);
  state.sheets[sheetName][rowIndex][colIndex] = cell.textContent;

  if (sheetName === "assets") {
    state.confirmedAssets = false;
    syncAssetFromSheet(rowIndex);
    renderAssetConfigPreview();
    renderAssetList();
  }
}

function pasteCells(event) {
  const text = event.clipboardData.getData("text/plain");
  if (!text.includes("\t") && !text.includes("\n")) {
    return;
  }

  event.preventDefault();
  const sheetName = event.currentTarget.dataset.sheet;
  const columns = assetColumns;
  const startRow = Number(event.currentTarget.dataset.row);
  const startCol = Number(event.currentTarget.dataset.col);
  const rows = text.replace(/\r/g, "").split("\n").filter((row) => row.length);

  rows.forEach((rowText, rowOffset) => {
    const cells = rowText.split("\t");
    const targetRow = startRow + rowOffset;

    if (sheetName === "assets" && targetRow >= state.assets.length) {
      return;
    }

    while (state.sheets[sheetName].length <= targetRow) {
      state.sheets[sheetName].push(Array.from({ length: columns.length }, () => ""));
    }

    cells.forEach((cellText, colOffset) => {
      const targetCol = startCol + colOffset;
      if (targetCol < columns.length) {
        state.sheets[sheetName][targetRow][targetCol] = cellText;
      }
    });

    if (sheetName === "assets") {
      state.confirmedAssets = false;
      syncAssetFromSheet(targetRow);
    }
  });

  renderAll();
  const nextCell = document.querySelector(
    `.sheet td[data-sheet="${sheetName}"][data-row="${startRow}"][data-col="${startCol}"]`,
  );
  nextCell?.focus();
}

function copySelection(event) {
  if (!state.selection) {
    return;
  }

  const range = normalizeSelection(state.selection);
  const rows = [];

  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const cells = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      cells.push(state.sheets[state.selection.sheet]?.[row]?.[col] ?? "");
    }
    rows.push(cells.join("\t"));
  }

  event.clipboardData.setData("text/plain", rows.join("\n"));
  event.preventDefault();
}

function confirmAssets() {
  state.confirmedAssets = true;
  renderAssetConfigPreview();
}

function exportYaml() {
  const yaml = toYaml({
    app: "Prep2Print",
    version: 2,
    exportedAt: new Date().toISOString(),
    currentStep: state.currentStep,
    confirmedAssets: state.confirmedAssets,
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
    assets: state.assets.map((asset) => ({
      fileName: asset.fileName,
      type: asset.type,
      size: asset.size,
      rows: asset.rows,
      columns: asset.columns,
      imageCount: asset.imageCount,
      width: asset.width,
      height: asset.height,
      uploadedAt: asset.uploadedAt,
      dataUrl: asset.dataUrl,
    })),
    sheets: {
      assets: state.sheets.assets,
    },
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

function bindDropZone(dropZone, input, handler) {
  input.addEventListener("change", (event) => {
    handler(event.target.files);
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
    handler(event.dataTransfer.files);
  });

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      input.click();
    }
  });
}

bindDropZone(elements.templateDropZone, elements.templateFileInput, handleTemplateFiles);
bindDropZone(elements.assetDropZone, elements.assetFileInput, handleAssetFiles);

elements.stepButtons.forEach((button) => {
  button.addEventListener("click", () => setStep(button.dataset.stepButton));
});
elements.continueToAssetsButton.addEventListener("click", () => setStep("assets"));
elements.continueToConfigureButton.addEventListener("click", () => setStep("configure"));
elements.confirmAssetsButton.addEventListener("click", confirmAssets);
elements.exportYamlButton.addEventListener("click", exportYaml);
document.addEventListener("mouseup", endSelection);
document.addEventListener("copy", copySelection);

renderAll();
