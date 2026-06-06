const assetColumns = ["File Name", "Rows", "Columns", "Images"];
const imageColumns = ["Asset", "Index", "Alias"];
const cardColumns = ["Front", "Back", "Qty", "Template", "Placeholder"];

const state = {
  currentStep: "templates",
  templates: [],
  selectedTemplateId: null,
  assets: [],
  selectedAssetId: null,
  images: [],
  selectedImageId: null,
  cards: [],
  selectedCardId: null,
  generatedSheets: [],
  generationWarnings: [],
  generationRequestId: 0,
  confirmedAssets: false,
  confirmedImages: false,
  confirmedCards: false,
  sheets: {
    assets: createSheet(assetColumns, 0),
    images: createSheet(imageColumns, 0),
    cards: createSheet(cardColumns, 0),
  },
  selection: null,
  isSelecting: false,
  editingCell: null,
  autocompleteCell: null,
  cardPreview: {
    side: "front",
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    startX: 0,
    startY: 0,
  },
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
  imageSheet: document.querySelector("#imageSheet"),
  imageReviewTitle: document.querySelector("#imageReviewTitle"),
  imageReviewMeta: document.querySelector("#imageReviewMeta"),
  imageReviewPreview: document.querySelector("#imageReviewPreview"),
  confirmImagesButton: document.querySelector("#confirmImagesButton"),
  cardSheet: document.querySelector("#cardSheet"),
  addCardButton: document.querySelector("#addCardButton"),
  removeCardButton: document.querySelector("#removeCardButton"),
  cardPreviewTitle: document.querySelector("#cardPreviewTitle"),
  cardPreviewMeta: document.querySelector("#cardPreviewMeta"),
  cardPreviewViewport: document.querySelector("#cardPreviewViewport"),
  cardPreviewCanvas: document.querySelector("#cardPreviewCanvas"),
  cardPreview: document.querySelector("#cardPreview"),
  frontSideButton: document.querySelector("#frontSideButton"),
  backSideButton: document.querySelector("#backSideButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomResetButton: document.querySelector("#zoomResetButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  generatedSheetsMeta: document.querySelector("#generatedSheetsMeta"),
  generatedSheetsWarnings: document.querySelector("#generatedSheetsWarnings"),
  generatedSheetsGrid: document.querySelector("#generatedSheetsGrid"),
  exportPdfButton: document.querySelector("#exportPdfButton"),
  autocompleteMenu: document.querySelector("#autocompleteMenu"),
  importYamlButton: document.querySelector("#importYamlButton"),
  importYamlInput: document.querySelector("#importYamlInput"),
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
  if (step === "configure") {
    return state.assets.length > 0;
  }
  if (step === "review") {
    return state.confirmedAssets && state.images.length > 0;
  }
  if (step === "cards") {
    return state.confirmedImages && state.cards.length > 0;
  }
  return step === "sheets" && state.confirmedImages && state.cards.length > 0;
}

function updateStepAvailability() {
  elements.stepButtons.forEach((button) => {
    const step = button.dataset.stepButton;
    button.disabled = !canOpenStep(step);
  });
  elements.continueToAssetsButton.disabled = state.templates.length === 0;
  elements.continueToConfigureButton.disabled = state.assets.length === 0;
  elements.confirmAssetsButton.disabled = state.assets.length === 0;
  elements.confirmImagesButton.disabled = state.images.length === 0;
  elements.removeCardButton.disabled = !state.selectedCardId;
  elements.exportPdfButton.disabled = state.generatedSheets.length === 0;
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
  const alias = stripExtension(file.name);

  return {
    id: crypto.randomUUID(),
    alias,
    fileName: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    imageCount: images.length,
    placeholders: images.map((image, index) => getPlaceholderName(image, index)),
    width,
    height,
    viewBox,
    svgText: text,
  };
}

function getPlaceholderName(image, index) {
  const href =
    image.getAttribute("href") ||
    image.getAttribute("xlink:href") ||
    image.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
    "";
  const label =
    href ||
    image.getAttribute("id") ||
    image.getAttribute("inkscape:label") ||
    image.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "label") ||
    "";
  const clean = label.split("/").pop().replace(/\.[^.]+$/, "").trim();
  return clean || `image_${String(index + 1).padStart(2, "0")}`;
}

async function handleTemplateFiles(files) {
  const svgFiles = Array.from(files).filter((file) =>
    file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml",
  );

  for (const file of svgFiles) {
    const template = await createTemplateFromFile(file);
    state.templates.push(template);
    state.selectedTemplateId = template.id;
  }

  renderAll();
}

async function createTemplateFromFile(file, existingTemplate = null) {
  const text = await file.text();
  try {
    const template = parseSvgFile(file, text);
    return {
      ...template,
      id: existingTemplate?.id || template.id,
      alias: existingTemplate?.alias || template.alias,
    };
  } catch (error) {
    return {
      id: existingTemplate?.id || crypto.randomUUID(),
      alias: existingTemplate?.alias || stripExtension(file.name),
      fileName: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      imageCount: 0,
      placeholders: [],
      width: "",
      height: "",
      viewBox: "",
      svgText: "",
      error: error.message,
    };
  }
}

async function replaceTemplateFile(templateId, file) {
  if (!file) {
    return;
  }

  const index = state.templates.findIndex((template) => template.id === templateId);
  if (index < 0) {
    return;
  }

  const template = await createTemplateFromFile(file, state.templates[index]);
  state.templates[index] = template;
  state.selectedTemplateId = template.id;
  invalidateGeneratedSheets();
  renderAll();
}

async function handleAssetFiles(files) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

  if (imageFiles.length) {
    state.confirmedAssets = false;
  }

  for (const file of imageFiles) {
    const asset = await createAssetFromFile(file);
    state.assets.push(asset);
    state.selectedAssetId = asset.id;
  }

  syncAssetSheet();
  renderAll();
}

async function createAssetFromFile(file, existingAsset = null) {
  const dataUrl = await readFileAsDataUrl(file);
  const asset = {
    id: existingAsset?.id || crypto.randomUUID(),
    fileName: file.name,
    type: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    dataUrl,
    objectUrl: URL.createObjectURL(file),
    rows: existingAsset?.rows || 1,
    columns: existingAsset?.columns || 1,
    imageCount: existingAsset?.imageCount || 1,
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

  return asset;
}

async function replaceAssetFile(assetId, file) {
  if (!file) {
    return;
  }

  const index = state.assets.findIndex((asset) => asset.id === assetId);
  if (index < 0) {
    return;
  }

  const previousAsset = state.assets[index];
  const asset = await createAssetFromFile(file, previousAsset);
  if (previousAsset.objectUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(previousAsset.objectUrl);
  }

  state.assets[index] = asset;
  state.selectedAssetId = asset.id;
  state.confirmedAssets = false;
  state.confirmedImages = false;
  state.confirmedCards = false;
  clearImageSliceCacheForAsset(asset.id);
  syncAssetSheet();
  invalidateGeneratedSheets();
  renderAll();
}

function clearImageSliceCacheForAsset(assetId) {
  state.images
    .filter((image) => image.assetId === assetId)
    .forEach((image) => {
      delete image.sliceDataUrl;
    });
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

function syncImagesFromAssets() {
  const aliasesById = new Map(state.images.map((image) => [image.id, image.alias]));
  const images = [];

  for (const asset of state.assets) {
    const count = Math.min(asset.imageCount, asset.rows * asset.columns);
    const baseAlias = stripExtension(asset.fileName);

    for (let index = 0; index < count; index += 1) {
      const id = `${asset.id}:${index}`;
      const row = Math.floor(index / asset.columns);
      const col = index % asset.columns;
      const defaultAlias = `${baseAlias}_${String(index + 1).padStart(2, "0")}`;

      images.push({
        id,
        assetId: asset.id,
        assetFileName: asset.fileName,
        index,
        row,
        col,
        alias: aliasesById.get(id) || defaultAlias,
      });
    }
  }

  state.images = images;
  state.selectedImageId =
    state.images.find((image) => image.id === state.selectedImageId)?.id ||
    state.images[0]?.id ||
    null;
  syncImageSheet();
}

function syncImageSheet() {
  state.sheets.images = state.images.map((image) => [
    image.assetFileName,
    String(image.index + 1),
    image.alias,
  ]);
}

function syncImageFromSheet(rowIndex) {
  const image = state.images[rowIndex];
  if (!image) {
    return;
  }

  const row = state.sheets.images[rowIndex];
  image.alias = row[2] || defaultImageAlias(image);
  row[0] = image.assetFileName;
  row[1] = String(image.index + 1);
  row[2] = image.alias;
}

function syncCardsFromImages() {
  const existingByImageId = new Map(state.cards.map((card) => [card.imageId, card]));
  const defaultTemplate = getDefaultTemplateAlias();
  const defaultPlaceholder = getDefaultPlaceholder(defaultTemplate);

  state.cards = state.images.map((image) => {
    const existing = existingByImageId.get(image.id);
    return {
      id: existing?.id || crypto.randomUUID(),
      imageId: image.id,
      frontAlias: image.alias,
      backAlias: existing?.backAlias || "",
      quantity: existing?.quantity || 1,
      templateAlias: existing?.templateAlias || defaultTemplate,
      placeholderName: existing?.placeholderName || defaultPlaceholder,
    };
  });

  state.selectedCardId =
    state.cards.find((card) => card.id === state.selectedCardId)?.id ||
    state.cards[0]?.id ||
    null;
  syncCardSheet();
  invalidateGeneratedSheets();
}

function syncCardSheet() {
  state.sheets.cards = state.cards.map((card) => [
    card.frontAlias,
    card.backAlias,
    String(card.quantity),
    card.templateAlias,
    card.placeholderName,
  ]);
}

function syncCardFromSheet(rowIndex) {
  const card = state.cards[rowIndex];
  if (!card) {
    return;
  }

  const row = state.sheets.cards[rowIndex];
  card.frontAlias = row[0] || "";
  card.imageId = getImageByAlias(card.frontAlias)?.id || card.imageId || "";
  card.backAlias = row[1] || "";
  card.quantity = clampPositiveInteger(row[2], 1);
  card.templateAlias = row[3] || getDefaultTemplateAlias();
  card.placeholderName = row[4] || getDefaultPlaceholder(card.templateAlias);
  row[2] = String(card.quantity);
  row[3] = card.templateAlias;
  row[4] = card.placeholderName;
  invalidateGeneratedSheets();
}

function invalidateGeneratedSheets() {
  state.generatedSheets = [];
  state.generationWarnings = [];
  state.generationRequestId += 1;
}

function getDefaultTemplateAlias() {
  return state.templates[0]?.alias || "";
}

function getDefaultPlaceholder(templateAlias) {
  const template = getTemplateByAlias(templateAlias) || state.templates[0];
  return template?.placeholders?.[0] || "";
}

function defaultImageAlias(image) {
  return `${stripExtension(image.assetFileName)}_${String(image.index + 1).padStart(2, "0")}`;
}

function stripExtension(fileName) {
  return String(fileName).replace(/\.[^.]+$/, "");
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
  renderSheet(elements.imageSheet, "images", imageColumns);
  renderImageReviewPreview();
  renderSheet(elements.cardSheet, "cards", cardColumns);
  renderCardPreview();
  renderGeneratedSheets();
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
    const card = document.createElement("div");
    card.className = "template-card-row";

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

    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.className = "replace-file-button";
    replaceButton.textContent = "Replace";
    replaceButton.setAttribute("aria-label", `Replace ${template.fileName}`);
    replaceButton.addEventListener("click", () => {
      promptFileReplacement({
        accept: ".svg,image/svg+xml",
        onSelect: (file) => replaceTemplateFile(template.id, file),
      });
    });

    card.append(button, replaceButton);
    elements.templateList.append(card);
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
    const card = document.createElement("div");
    card.className = "template-card-row";

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

    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.className = "replace-file-button";
    replaceButton.textContent = "Replace";
    replaceButton.setAttribute("aria-label", `Replace ${asset.fileName}`);
    replaceButton.addEventListener("click", () => {
      promptFileReplacement({
        accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
        onSelect: (file) => replaceAssetFile(asset.id, file),
      });
    });

    card.append(button, replaceButton);
    elements.assetList.append(card);
  }
}

function promptFileReplacement({ accept, onSelect }) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  input.addEventListener("change", () => {
    Promise.resolve(onSelect(input.files?.[0] || null)).catch((error) => {
      alert(`Could not replace file: ${error.message}`);
    });
    input.remove();
  });
  document.body.append(input);
  input.click();
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
  )}" src="${getAssetSource(selected)}" />`;
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
  const width = asset.width || 1;
  const height = asset.height || 1;
  const ratio = width / height;
  const tiles = [];

  for (let index = 0; index < rows * cols; index += 1) {
    const hiddenClass = index >= count ? " is-hidden" : "";
    tiles.push(`<div class="asset-tile${hiddenClass}"></div>`);
  }

  return `
    <div
      class="asset-stage"
      style="--asset-width: ${width}; --asset-height: ${height}; --asset-ratio: ${ratio};"
      role="img"
      aria-label="${escapeHtml(asset.fileName)} sliced preview"
    >
      <img class="asset-stage-image" alt="" src="${getAssetSource(asset)}" />
      <div class="asset-grid-overlay" style="--grid-cols: ${cols}; --grid-rows: ${rows};">
        ${tiles.join("")}
      </div>
    </div>
  `;
}

function getAssetSource(asset) {
  return asset?.objectUrl || asset?.dataUrl || "";
}

function getSelectedAsset() {
  return state.assets.find((asset) => asset.id === state.selectedAssetId);
}

async function renderImageReviewPreview() {
  const selected = getSelectedImage();

  if (!selected) {
    elements.imageReviewTitle.textContent = "No image selected";
    elements.imageReviewMeta.textContent = state.confirmedImages
      ? "Images confirmed for the next project step."
      : "Click an image row to inspect it.";
    elements.imageReviewPreview.innerHTML = '<div class="empty-preview">Image preview</div>';
    return;
  }

  const asset = getAssetForImage(selected);
  elements.imageReviewTitle.textContent = selected.alias;
  elements.imageReviewMeta.textContent = state.confirmedImages
    ? "Images confirmed for the next project step."
    : `${selected.assetFileName} · image ${selected.index + 1}`;

  if (!asset) {
    elements.imageReviewPreview.innerHTML = '<div class="empty-preview">Asset missing</div>';
    return;
  }

  const selectedId = selected.id;
  elements.imageReviewPreview.innerHTML = '<div class="empty-preview">Loading image...</div>';

  try {
    const preview = await buildImageSlice(selected, asset);
    if (state.selectedImageId === selectedId) {
      elements.imageReviewPreview.innerHTML = preview;
    }
  } catch {
    if (state.selectedImageId === selectedId) {
      elements.imageReviewPreview.innerHTML =
        '<div class="empty-preview">Image could not be loaded</div>';
    }
  }
}

async function buildImageSlice(image, asset) {
  const cols = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const tileWidth = asset.width ? asset.width / cols : 1;
  const tileHeight = asset.height ? asset.height / rows : 1;
  const ratio = tileWidth / tileHeight;
  const source = await getImageSliceDataUrl(image);

  return `
    <img
      class="image-slice-stage"
      style="--slice-ratio: ${ratio};"
      alt="${escapeHtml(image.alias)}"
      src="${source}"
    />
  `;
}

function getSelectedImage() {
  return state.images.find((image) => image.id === state.selectedImageId);
}

function getAssetForImage(image) {
  return state.assets.find((asset) => asset.id === image.assetId);
}

async function renderCardPreview() {
  const selected = getSelectedCard();

  if (!selected) {
    elements.cardPreviewTitle.textContent = "No card selected";
    elements.cardPreviewMeta.textContent = "Select a card row to preview it on a print template.";
    elements.cardPreview.innerHTML = '<div class="empty-preview">Card template preview</div>';
    updateCardSideButtons();
    applyCardPreviewTransform();
    return;
  }

  const side = state.cardPreview.side;
  const selectedId = selected.id;
  const sideLabel = side === "back" ? "Back" : "Front";
  const imageAlias = getCardImageAlias(selected, side);
  elements.cardPreviewTitle.textContent = `${sideLabel}: ${imageAlias || "No image selected"}`;
  elements.cardPreviewMeta.textContent = `${selected.quantity} copies · ${
    selected.templateAlias || "no template"
  } · ${selected.placeholderName || "no placeholder"}`;
  updateCardSideButtons();

  try {
    const preview = await buildCardTemplatePreview(selected, side);
    if (state.selectedCardId !== selectedId || state.cardPreview.side !== side) {
      return;
    }

    elements.cardPreview.innerHTML = preview;
    const svg = elements.cardPreview.querySelector("svg");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${imageAlias} ${sideLabel.toLowerCase()} sheet preview`);
    }
  } catch (error) {
    if (state.selectedCardId !== selectedId || state.cardPreview.side !== side) {
      return;
    }

    elements.cardPreview.innerHTML = `<div class="empty-preview">${escapeHtml(
      error.message,
    )}</div>`;
  }

  applyCardPreviewTransform();
}

function getCardImageAlias(card, side) {
  return side === "back" ? card.backAlias : card.frontAlias;
}

async function buildCardTemplatePreview(card, side = "front") {
  const template = getTemplateByAlias(card.templateAlias);
  const imageAlias = getCardImageAlias(card, side);
  const cardImage = getImageByAlias(imageAlias);
  const sideLabel = side === "back" ? "Back" : "Front";

  if (!template) {
    throw new Error("Template alias not found.");
  }
  if (!imageAlias) {
    throw new Error(`${sideLabel} image alias is empty.`);
  }
  if (!cardImage) {
    throw new Error(`${sideLabel} image alias not found.`);
  }

  const imageDataUrl = await getImageSliceDataUrl(cardImage);
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(template.svgText, "image/svg+xml");
  const svg = documentSvg.querySelector("svg");
  if (!svg) {
    throw new Error("The selected template is not a valid SVG.");
  }

  removeUnsafeSvgContent(documentSvg);

  const imageNodes = Array.from(svg.querySelectorAll("image"));
  const matchingNodes = imageNodes.filter(
    (image, index) => getPlaceholderName(image, index) === card.placeholderName,
  );
  const targets = matchingNodes.length ? matchingNodes : imageNodes;
  const replacedTargets = targets.slice(0, card.quantity);

  replacedTargets.forEach((image) => {
    image.setAttribute("href", imageDataUrl);
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageDataUrl);
  });

  if (side === "back") {
    mirrorBackSheet(svg, documentSvg, replacedTargets);
  }

  return new XMLSerializer().serializeToString(svg);
}

function mirrorBackSheet(svg, documentSvg, imageNodes) {
  const metrics = getSvgMirrorMetrics(svg);
  if (!metrics) {
    throw new Error("The SVG needs a viewBox or numeric width to preview the back side.");
  }

  imageNodes.forEach(mirrorImageInPlace);

  const group = documentSvg.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute(
    "transform",
    `translate(${formatSvgNumber(metrics.mirrorEdge)} 0) scale(-1 1)`,
  );

  const children = Array.from(svg.childNodes);
  for (const child of children) {
    if (shouldKeepSvgRootChild(child)) {
      continue;
    }
    group.append(child);
  }

  if (group.childNodes.length) {
    svg.append(group);
  }
}

function getSvgMirrorMetrics(svg) {
  const viewBox = svg.getAttribute("viewBox") || "";
  const viewBoxParts = viewBox.trim().split(/\s+/).map(Number);
  if (viewBoxParts.length === 4 && viewBoxParts.every(Number.isFinite) && viewBoxParts[2] > 0) {
    return {
      mirrorEdge: viewBoxParts[0] * 2 + viewBoxParts[2],
    };
  }

  const width = parseSvgNumber(svg.getAttribute("width"));
  if (width > 0) {
    return { mirrorEdge: width };
  }

  return null;
}

function shouldKeepSvgRootChild(child) {
  if (child.nodeType !== 1) {
    return false;
  }

  return ["defs", "title", "desc", "metadata", "style"].includes(
    child.localName?.toLowerCase(),
  );
}

function mirrorImageInPlace(image) {
  const x = parseSvgNumber(image.getAttribute("x"));
  const width = parseSvgNumber(image.getAttribute("width"));

  if (!(width > 0)) {
    return;
  }

  const existingTransform = image.getAttribute("transform") || "";
  const imageMirror = `translate(${formatSvgNumber(x * 2 + width)} 0) scale(-1 1)`;
  image.setAttribute("transform", [existingTransform, imageMirror].filter(Boolean).join(" "));
}

function parseSvgNumber(value) {
  const number = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(number) ? number : 0;
}

function formatSvgNumber(value) {
  return Number(value.toFixed(6)).toString();
}

async function renderGeneratedSheets() {
  if (state.currentStep !== "sheets") {
    return;
  }

  const requestId = ++state.generationRequestId;
  elements.generatedSheetsMeta.textContent = "Building printable sheets...";
  elements.generatedSheetsGrid.innerHTML = '<div class="empty-preview">Building sheets...</div>';
  elements.generatedSheetsWarnings.hidden = true;
  elements.exportPdfButton.disabled = true;

  try {
    const result = await generatePrintSheets();
    if (requestId !== state.generationRequestId || state.currentStep !== "sheets") {
      return;
    }

    state.generatedSheets = result.sheets;
    state.generationWarnings = result.warnings;
    renderGeneratedSheetsResult();
  } catch (error) {
    if (requestId !== state.generationRequestId || state.currentStep !== "sheets") {
      return;
    }

    state.generatedSheets = [];
    state.generationWarnings = [error.message];
    elements.generatedSheetsMeta.textContent = "No sheets generated.";
    elements.generatedSheetsGrid.innerHTML = `<div class="empty-preview">${escapeHtml(
      error.message,
    )}</div>`;
    renderGenerationWarnings();
    elements.exportPdfButton.disabled = true;
  }
}

function renderGeneratedSheetsResult() {
  const pageCount = state.generatedSheets.length * 2;
  elements.generatedSheetsMeta.textContent = `${state.generatedSheets.length} printable ${
    state.generatedSheets.length === 1 ? "sheet" : "sheets"
  } · ${pageCount} PDF ${pageCount === 1 ? "page" : "pages"}`;
  elements.exportPdfButton.disabled = state.generatedSheets.length === 0;
  renderGenerationWarnings();

  if (!state.generatedSheets.length) {
    elements.generatedSheetsGrid.innerHTML =
      '<div class="empty-preview">No printable sheets could be generated.</div>';
    return;
  }

  elements.generatedSheetsGrid.innerHTML = state.generatedSheets
    .map((sheet, index) => renderGeneratedSheetCard(sheet, index))
    .join("");
}

function renderGenerationWarnings() {
  if (!state.generationWarnings.length) {
    elements.generatedSheetsWarnings.hidden = true;
    elements.generatedSheetsWarnings.innerHTML = "";
    return;
  }

  elements.generatedSheetsWarnings.hidden = false;
  elements.generatedSheetsWarnings.innerHTML = state.generationWarnings
    .map((warning) => `<p>${escapeHtml(warning)}</p>`)
    .join("");
}

function renderGeneratedSheetCard(sheet, index) {
  return `
    <article class="generated-sheet-card">
      <header>
        <div>
          <h3>Sheet ${String(index + 1).padStart(2, "0")}</h3>
          <p>${escapeHtml(sheet.templateAlias)} · ${sheet.assignmentCount} cards</p>
        </div>
      </header>
      <div class="generated-sheet-pages">
        ${sheet.pages
          .map(
            (page) => `
              <section class="generated-sheet-page">
                <h4>${page.side === "front" ? "Front" : "Back"}</h4>
                <div class="generated-sheet-preview">${page.svgText}</div>
              </section>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

async function generatePrintSheets() {
  const warnings = [];
  const warningSet = new Set();
  const workingSheets = [];

  function addWarning(message) {
    if (!warningSet.has(message)) {
      warningSet.add(message);
      warnings.push(message);
    }
  }

  for (const card of state.cards) {
    const template = getTemplateByAlias(card.templateAlias);
    const frontImage = getImageByAlias(card.frontAlias);

    if (!template) {
      addWarning(`Skipped ${card.frontAlias || "a card"}: template alias not found.`);
      continue;
    }
    if (!frontImage) {
      addWarning(`Skipped ${card.frontAlias || "a card"}: front image alias not found.`);
      continue;
    }

    const quantity = clampPositiveInteger(card.quantity, 1);
    for (let copy = 0; copy < quantity; copy += 1) {
      const sheet = findOrCreateWorkingSheet(workingSheets, template, card.placeholderName);
      const slot = findAvailableSlot(sheet, card.placeholderName);

      if (!slot) {
        addWarning(`Skipped ${card.frontAlias}: no placeholder slot available.`);
        continue;
      }

      slot.assignment = {
        cardId: card.id,
        frontAlias: card.frontAlias,
        backAlias: card.backAlias,
        placeholderName: card.placeholderName,
      };
    }
  }

  const generatedSheets = [];
  for (const workingSheet of workingSheets) {
    const frontSvg = await buildGeneratedSheetSvg(workingSheet, "front", addWarning);
    const backSvg = await buildGeneratedSheetSvg(workingSheet, "back", addWarning);
    generatedSheets.push({
      id: workingSheet.id,
      templateAlias: workingSheet.template.alias,
      templateFileName: workingSheet.template.fileName,
      assignmentCount: workingSheet.slots.filter((slot) => slot.assignment).length,
      pages: [
        { side: "front", svgText: frontSvg },
        { side: "back", svgText: backSvg },
      ],
    });
  }

  return { sheets: generatedSheets, warnings };
}

function findOrCreateWorkingSheet(workingSheets, template, placeholderName) {
  const existing = workingSheets.find(
    (sheet) => sheet.template.alias === template.alias && findAvailableSlot(sheet, placeholderName),
  );
  if (existing) {
    return existing;
  }

  const slots = getTemplateSlots(template).map((slot) => ({
    ...slot,
    assignment: null,
  }));

  const sheet = {
    id: crypto.randomUUID(),
    template,
    slots,
  };
  workingSheets.push(sheet);
  return sheet;
}

function findAvailableSlot(sheet, placeholderName) {
  const eligible = getEligibleSlots(sheet.slots, placeholderName);
  return eligible.find((slot) => !slot.assignment) || null;
}

function getEligibleSlots(slots, placeholderName) {
  const matching = slots.filter((slot) => slot.placeholderName === placeholderName);
  return matching.length ? matching : slots;
}

function getTemplateSlots(template) {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(template.svgText, "image/svg+xml");
  const svg = documentSvg.querySelector("svg");
  if (!svg) {
    throw new Error(`${template.alias} is not a valid SVG template.`);
  }

  const slots = Array.from(svg.querySelectorAll("image")).map((image, index) => ({
    index,
    placeholderName: getPlaceholderName(image, index),
  }));

  if (!slots.length) {
    throw new Error(`${template.alias} does not contain image placeholders.`);
  }

  return slots;
}

async function buildGeneratedSheetSvg(workingSheet, side, addWarning) {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(workingSheet.template.svgText, "image/svg+xml");
  const svg = documentSvg.querySelector("svg");
  if (!svg) {
    throw new Error(`${workingSheet.template.alias} is not a valid SVG template.`);
  }

  removeUnsafeSvgContent(documentSvg);
  hideGeneratedSheetPrintGuides(documentSvg);

  const imageNodes = Array.from(svg.querySelectorAll("image"));
  const replacedNodes = [];

  for (const slot of workingSheet.slots) {
    if (!slot.assignment) {
      continue;
    }

    const alias = side === "back" ? slot.assignment.backAlias : slot.assignment.frontAlias;
    if (!alias) {
      if (side === "back") {
        addWarning(`Back image is empty for ${slot.assignment.frontAlias}.`);
      }
      continue;
    }

    const image = getImageByAlias(alias);
    if (!image) {
      addWarning(`${side === "back" ? "Back" : "Front"} image alias not found: ${alias}.`);
      continue;
    }

    const imageNode = imageNodes[slot.index];
    if (!imageNode) {
      addWarning(`Placeholder slot ${slot.index + 1} is missing in ${workingSheet.template.alias}.`);
      continue;
    }

    const imageDataUrl = await getImageSliceDataUrl(image);
    imageNode.setAttribute("href", imageDataUrl);
    imageNode.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageDataUrl);
    replacedNodes.push(imageNode);
  }

  if (side === "back") {
    mirrorBackSheet(svg, documentSvg, replacedNodes);
  }

  return new XMLSerializer().serializeToString(svg);
}

function hideGeneratedSheetPrintGuides(documentSvg) {
  const classPaints = collectSvgClassPaints(documentSvg);
  const inheritedPaints = new Map();

  for (const element of documentSvg.querySelectorAll("*")) {
    const paint = getEffectiveSvgPaint(element, classPaints, inheritedPaints);
    if (
      isRenderableSvgElement(element) &&
      (isPrintGuideColor(paint.stroke) || isPrintGuideColor(paint.fill))
    ) {
      element.setAttribute("display", "none");
    }
  }
}

function collectSvgClassPaints(documentSvg) {
  const classPaints = new Map();

  for (const style of documentSvg.querySelectorAll("style")) {
    const css = style.textContent || "";
    for (const match of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      const selectors = match[1].split(",").map((selector) => selector.trim());
      const declarations = parseStyleDeclarations(match[2]);
      const paint = {
        stroke: declarations.get("stroke") || "",
        fill: declarations.get("fill") || "",
      };

      if (!paint.stroke && !paint.fill) {
        continue;
      }

      selectors.forEach((selector) => {
        const classMatch = selector.match(/\.([A-Za-z0-9_-]+)/);
        if (classMatch) {
          classPaints.set(classMatch[1], paint);
        }
      });
    }
  }

  return classPaints;
}

function getEffectiveSvgPaint(element, classPaints, inheritedPaints) {
  if (inheritedPaints.has(element)) {
    return inheritedPaints.get(element);
  }

  const inherited =
    element.parentElement && element.parentElement.localName?.toLowerCase() !== "svg"
      ? getEffectiveSvgPaint(element.parentElement, classPaints, inheritedPaints)
      : { stroke: "", fill: "" };
  const classPaint = getClassPaint(element, classPaints);
  const inlineDeclarations = parseStyleDeclarations(element.getAttribute("style") || "");
  const paint = {
    stroke:
      inlineDeclarations.get("stroke") ||
      classPaint.stroke ||
      element.getAttribute("stroke") ||
      inherited.stroke,
    fill:
      inlineDeclarations.get("fill") ||
      classPaint.fill ||
      element.getAttribute("fill") ||
      inherited.fill,
  };

  inheritedPaints.set(element, paint);
  return paint;
}

function getClassPaint(element, classPaints) {
  const paint = { stroke: "", fill: "" };

  String(element.getAttribute("class") || "")
    .split(/\s+/)
    .map((className) => classPaints.get(className))
    .filter(Boolean)
    .forEach((classPaint) => {
      paint.stroke = classPaint.stroke || paint.stroke;
      paint.fill = classPaint.fill || paint.fill;
    });

  return paint;
}

function parseStyleDeclarations(styleText) {
  const declarations = new Map();

  String(styleText || "")
    .split(";")
    .forEach((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) {
        return;
      }

      declarations.set(
        declaration.slice(0, separator).trim().toLowerCase(),
        declaration.slice(separator + 1).trim(),
      );
    });

  return declarations;
}

function isRenderableSvgElement(element) {
  return [
    "circle",
    "ellipse",
    "line",
    "path",
    "polygon",
    "polyline",
    "rect",
    "text",
    "tspan",
    "use",
  ].includes(element.localName?.toLowerCase());
}

function isPrintGuideColor(value) {
  const color = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return (
    color.startsWith("#123456") ||
    color.startsWith("123456") ||
    color === "rgb(18,52,86)" ||
    color.startsWith("rgba(18,52,86,")
  );
}

function exportGeneratedSheetsPdf() {
  if (!state.generatedSheets.length) {
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("The PDF window was blocked. Allow pop-ups and try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintDocumentHtml());
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 300);
}

function buildPrintDocumentHtml() {
  const pages = state.generatedSheets.flatMap((sheet, sheetIndex) =>
    sheet.pages.map((page) => ({
      ...page,
      sheetIndex,
      templateAlias: sheet.templateAlias,
    })),
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Prep2Print PDF</title>
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #fff; }
      .print-page {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100vw;
        min-height: 100vh;
        break-after: page;
        page-break-after: always;
        overflow: hidden;
      }
      .print-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }
      .print-page svg {
        display: block;
        width: 100%;
        height: auto;
        max-width: 100vw;
        max-height: 100vh;
      }
      @media print {
        .print-page {
          height: 100vh;
        }
      }
    </style>
  </head>
  <body>
    ${pages
      .map(
        (page) => `
          <section class="print-page" data-sheet="${page.sheetIndex + 1}" data-side="${page.side}">
            ${page.svgText}
          </section>
        `,
      )
      .join("")}
  </body>
</html>`;
}

function getSelectedCard() {
  return state.cards.find((card) => card.id === state.selectedCardId);
}

function getImageByAlias(alias) {
  return state.images.find((image) => image.alias === alias);
}

function getTemplateByAlias(alias) {
  return state.templates.find((template) => template.alias === alias);
}

async function getImageSliceDataUrl(image) {
  if (image.sliceDataUrl) {
    return image.sliceDataUrl;
  }

  const asset = getAssetForImage(image);
  if (!asset) {
    throw new Error("Asset for image not found.");
  }

  const cols = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const assetSource = getAssetSource(asset);
  if (!assetSource) {
    throw new Error("Asset image data is missing.");
  }

  const source = await loadImageElement(assetSource);
  const sourceWidth = asset.width || source.naturalWidth || source.width || 1;
  const sourceHeight = asset.height || source.naturalHeight || source.height || 1;
  const tileWidth = sourceWidth / cols;
  const tileHeight = sourceHeight / rows;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(tileWidth));
  canvas.height = Math.max(1, Math.round(tileHeight));
  const context = canvas.getContext("2d");
  context.drawImage(
    source,
    image.col * tileWidth,
    image.row * tileHeight,
    tileWidth,
    tileHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  image.sliceDataUrl = canvas.toDataURL("image/png");
  return image.sliceDataUrl;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("The image slice could not be loaded.")));
    image.src = src;
  });
}

function sanitizeSvgForPreview(svgText) {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(svgText, "image/svg+xml");
  removeUnsafeSvgContent(documentSvg);

  return new XMLSerializer().serializeToString(documentSvg.documentElement);
}

function removeUnsafeSvgContent(documentSvg) {
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
    if (sheetName === "images" && state.images[rowIndex]?.id === state.selectedImageId) {
      tr.classList.add("is-active-row");
    }
    if (sheetName === "cards" && state.cards[rowIndex]?.id === state.selectedCardId) {
      tr.classList.add("is-active-row");
    }

    const rowHead = document.createElement("th");
    rowHead.textContent = String(rowIndex + 1);
    tr.append(rowHead);

    columns.forEach((_, colIndex) => {
      const td = document.createElement("td");
      td.contentEditable = "false";
      td.tabIndex = 0;
      td.spellcheck = false;
      td.dataset.sheet = sheetName;
      td.dataset.row = String(rowIndex);
      td.dataset.col = String(colIndex);
      td.dataset.readonly = String(isReadOnlyCell(sheetName, colIndex));
      td.textContent = row[colIndex] ?? "";
      td.addEventListener("focus", selectCell);
      td.addEventListener("mousedown", beginSelection);
      td.addEventListener("mouseenter", extendSelection);
      td.addEventListener("keydown", handleCellKeydown);
      td.addEventListener("dblclick", beginCellEdit);
      td.addEventListener("blur", endCellEdit);
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

function isReadOnlyCell(sheetName, colIndex) {
  return sheetName === "images" && colIndex < 2;
}

function handleCellClick(event) {
  const sheetName = event.currentTarget.dataset.sheet;
  const rowIndex = Number(event.currentTarget.dataset.row);

  if (sheetName === "assets" && state.assets[rowIndex]) {
    state.selectedAssetId = state.assets[rowIndex].id;
    renderAssetList();
    updateSheetActiveRow(elements.assetSheet, "assets");
    renderAssetConfigPreview();
  }

  if (sheetName === "images" && state.images[rowIndex]) {
    state.selectedImageId = state.images[rowIndex].id;
    updateSheetActiveRow(elements.imageSheet, "images");
    renderImageReviewPreview();
  }

  if (sheetName === "cards" && state.cards[rowIndex]) {
    state.selectedCardId = state.cards[rowIndex].id;
    elements.removeCardButton.disabled = false;
    updateSheetActiveRow(elements.cardSheet, "cards");
    renderCardPreview();
  }
}

function updateSheetActiveRow(table, sheetName) {
  table.querySelectorAll("tbody tr").forEach((row, index) => {
    const isActive =
      sheetName === "assets"
        ? state.assets[index]?.id === state.selectedAssetId
        : sheetName === "images"
          ? state.images[index]?.id === state.selectedImageId
          : state.cards[index]?.id === state.selectedCardId;
    row.classList.toggle("is-active-row", isActive);
  });
}

function updateSelectedEntityFromCell(cell) {
  const sheetName = cell.dataset.sheet;
  const rowIndex = Number(cell.dataset.row);

  if (sheetName === "assets" && state.assets[rowIndex]) {
    state.selectedAssetId = state.assets[rowIndex].id;
    renderAssetList();
    updateSheetActiveRow(elements.assetSheet, "assets");
    renderAssetConfigPreview();
  }

  if (sheetName === "images" && state.images[rowIndex]) {
    state.selectedImageId = state.images[rowIndex].id;
    updateSheetActiveRow(elements.imageSheet, "images");
    renderImageReviewPreview();
  }

  if (sheetName === "cards" && state.cards[rowIndex]) {
    state.selectedCardId = state.cards[rowIndex].id;
    updateSheetActiveRow(elements.cardSheet, "cards");
    renderCardPreview();
  }
}

function selectCell(event) {
  selectSingleCell(event.currentTarget);
}

function selectSingleCell(cell) {
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
  updateSelectedEntityFromCell(cell);
}

function beginSelection(event) {
  const cell = event.currentTarget;
  if (cell.classList.contains("is-editing")) {
    return;
  }

  event.preventDefault();
  closeEditingCell();

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
  cell.focus();
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
  syncCellValue(event.currentTarget);
  updateAutocomplete(event.currentTarget);
}

function syncCellValue(cell) {
  const sheetName = cell.dataset.sheet;
  const rowIndex = Number(cell.dataset.row);
  const colIndex = Number(cell.dataset.col);
  state.sheets[sheetName][rowIndex][colIndex] = cell.textContent;

  if (sheetName === "assets") {
    state.confirmedAssets = false;
    state.confirmedImages = false;
    syncAssetFromSheet(rowIndex);
    renderAssetConfigPreview();
    renderAssetList();
  }

  if (sheetName === "images") {
    state.confirmedImages = false;
    syncImageFromSheet(rowIndex);
    renderImageReviewPreview();
  }

  if (sheetName === "cards") {
    state.confirmedCards = false;
    syncCardFromSheet(rowIndex);
    renderCardPreview();
  }
}

function handleCellKeydown(event) {
  const cell = event.currentTarget;

  if (cell.classList.contains("is-editing")) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEditAndMove(cell, 1, 0);
    }
    return;
  }

  if (handleNavigationKey(event, cell)) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    if (!isCellReadOnly(cell)) {
      enterCellEdit(cell);
    }
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    if (!isCellReadOnly(cell)) {
      replaceSelectedCells("");
    }
    return;
  }

  if (isPrintableKey(event) && !isCellReadOnly(cell)) {
    event.preventDefault();
    enterCellEdit(cell, event.key);
  }
}

function handleNavigationKey(event, cell) {
  const deltas = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    Tab: [0, event.shiftKey ? -1 : 1],
  };

  if (!deltas[event.key]) {
    return false;
  }

  event.preventDefault();
  const [rowDelta, colDelta] = deltas[event.key];
  focusCell(
    cell.dataset.sheet,
    Number(cell.dataset.row) + rowDelta,
    Number(cell.dataset.col) + colDelta,
  );
  return true;
}

function focusCell(sheetName, rowIndex, colIndex) {
  const maxRow = state.sheets[sheetName].length - 1;
  const maxCol = getSheetColumns(sheetName).length - 1;
  const row = Math.max(0, Math.min(rowIndex, maxRow));
  const col = Math.max(0, Math.min(colIndex, maxCol));
  const nextCell = document.querySelector(
    `.sheet td[data-sheet="${sheetName}"][data-row="${row}"][data-col="${col}"]`,
  );

  if (!nextCell) {
    return;
  }

  closeEditingCell();
  selectSingleCell(nextCell);
  nextCell.focus();
}

function getSheetColumns(sheetName) {
  if (sheetName === "images") {
    return imageColumns;
  }
  if (sheetName === "cards") {
    return cardColumns;
  }
  return assetColumns;
}

function isCellReadOnly(cell) {
  return cell.dataset.readonly === "true";
}

function commitEditAndMove(cell, rowDelta, colDelta) {
  const sheetName = cell.dataset.sheet;
  const rowIndex = Number(cell.dataset.row);
  const colIndex = Number(cell.dataset.col);
  endCellEdit({ currentTarget: cell });
  focusCell(sheetName, rowIndex + rowDelta, colIndex + colDelta);
}

function beginCellEdit(event) {
  event.preventDefault();
  if (!isCellReadOnly(event.currentTarget)) {
    enterCellEdit(event.currentTarget);
  }
}

function enterCellEdit(cell, replacementText = null) {
  closeEditingCell();
  state.editingCell = cell;
  cell.contentEditable = "true";
  cell.classList.add("is-editing");
  state.autocompleteCell = cell;

  if (replacementText !== null) {
    cell.textContent = replacementText;
    syncCellValue(cell);
  }

  cell.focus();
  moveCaretToEnd(cell);
  updateAutocomplete(cell);
}

function endCellEdit(event) {
  const cell = event.currentTarget;
  if (!cell.classList.contains("is-editing")) {
    return;
  }

  syncCellValue(cell);
  const row = state.sheets[cell.dataset.sheet]?.[Number(cell.dataset.row)];
  if (row) {
    cell.textContent = row[Number(cell.dataset.col)] ?? "";
  }
  cell.contentEditable = "false";
  cell.classList.remove("is-editing");
  state.editingCell = null;
  hideAutocomplete();
}

function closeEditingCell() {
  if (!state.editingCell) {
    return;
  }

  const cell = state.editingCell;
  syncCellValue(cell);
  const row = state.sheets[cell.dataset.sheet]?.[Number(cell.dataset.row)];
  if (row) {
    cell.textContent = row[Number(cell.dataset.col)] ?? "";
  }
  cell.contentEditable = "false";
  cell.classList.remove("is-editing");
  state.editingCell = null;
  hideAutocomplete();
}

function replaceSelectedCells(value) {
  if (!state.selection) {
    return;
  }

  const range = normalizeSelection(state.selection);
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cell = document.querySelector(
        `.sheet td[data-sheet="${state.selection.sheet}"][data-row="${row}"][data-col="${col}"]`,
      );
      if (!cell || isCellReadOnly(cell)) {
        continue;
      }
      cell.textContent = value;
      syncCellValue(cell);
    }
  }
}

function isPrintableKey(event) {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function moveCaretToEnd(element) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function updateAutocomplete(cell) {
  const options = getAutocompleteOptions(cell);
  if (!options.length || !cell.classList.contains("is-editing")) {
    hideAutocomplete();
    return;
  }

  const value = cell.textContent.trim().toLowerCase();
  const matches = options
    .filter((option) => option.toLowerCase().includes(value))
    .slice(0, 8);

  if (!matches.length) {
    hideAutocomplete();
    return;
  }

  const rect = cell.getBoundingClientRect();
  elements.autocompleteMenu.innerHTML = "";
  for (const match of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "autocomplete-item";
    button.textContent = match;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      cell.textContent = match;
      syncCellValue(cell);
      moveCaretToEnd(cell);
      hideAutocomplete();
    });
    elements.autocompleteMenu.append(button);
  }

  elements.autocompleteMenu.hidden = false;
  elements.autocompleteMenu.style.left = `${rect.left + window.scrollX}px`;
  elements.autocompleteMenu.style.top = `${rect.bottom + window.scrollY + 3}px`;
  elements.autocompleteMenu.style.minWidth = `${rect.width}px`;
}

function getAutocompleteOptions(cell) {
  if (cell.dataset.sheet !== "cards") {
    return [];
  }

  const col = Number(cell.dataset.col);
  if (col === 0 || col === 1) {
    return state.images.map((image) => image.alias);
  }
  if (col === 3) {
    return state.templates.map((template) => template.alias);
  }
  if (col === 4) {
    const row = state.sheets.cards[Number(cell.dataset.row)];
    const template = getTemplateByAlias(row?.[3]);
    return template?.placeholders || [];
  }
  return [];
}

function hideAutocomplete() {
  elements.autocompleteMenu.hidden = true;
  elements.autocompleteMenu.innerHTML = "";
  state.autocompleteCell = null;
}

function setCardPreviewZoom(nextZoom) {
  state.cardPreview.zoom = Math.max(0.5, Math.min(16, nextZoom));
  applyCardPreviewTransform();
}

function setCardPreviewSide(side) {
  state.cardPreview.side = side === "back" ? "back" : "front";
  updateCardSideButtons();
  renderCardPreview();
}

function updateCardSideButtons() {
  const isBack = state.cardPreview.side === "back";
  elements.frontSideButton.classList.toggle("is-active", !isBack);
  elements.backSideButton.classList.toggle("is-active", isBack);
  elements.frontSideButton.setAttribute("aria-pressed", String(!isBack));
  elements.backSideButton.setAttribute("aria-pressed", String(isBack));
}

function resetCardPreviewTransform() {
  state.cardPreview.zoom = 1;
  state.cardPreview.panX = 0;
  state.cardPreview.panY = 0;
  applyCardPreviewTransform();
}

function applyCardPreviewTransform() {
  elements.cardPreviewCanvas.style.transform = `translate(${state.cardPreview.panX}px, ${state.cardPreview.panY}px) scale(${state.cardPreview.zoom})`;
  elements.zoomResetButton.textContent = `${Math.round(state.cardPreview.zoom * 100)}%`;
}

function startCardPreviewPan(event) {
  state.cardPreview.dragging = true;
  state.cardPreview.startX = event.clientX - state.cardPreview.panX;
  state.cardPreview.startY = event.clientY - state.cardPreview.panY;
  elements.cardPreviewViewport.classList.add("is-panning");
}

function moveCardPreviewPan(event) {
  if (!state.cardPreview.dragging) {
    return;
  }

  state.cardPreview.panX = event.clientX - state.cardPreview.startX;
  state.cardPreview.panY = event.clientY - state.cardPreview.startY;
  applyCardPreviewTransform();
}

function endCardPreviewPan() {
  state.cardPreview.dragging = false;
  elements.cardPreviewViewport.classList.remove("is-panning");
}

function pasteCells(event) {
  if (event.defaultPrevented) {
    return;
  }

  const text = event.clipboardData.getData("text/plain");
  if (!text) {
    return;
  }

  const target = event.currentTarget.dataset?.sheet
    ? event.currentTarget
    : document.activeElement;

  if (!target?.dataset?.sheet || target.classList.contains("is-editing")) {
    return;
  }

  event.preventDefault();
  const sheetName = target.dataset.sheet;
  const columns = getSheetColumns(sheetName);
  const startRow = Number(target.dataset.row);
  const startCol = Number(target.dataset.col);
  const isSingleValue = !text.includes("\t") && !text.includes("\n");

  if (isSingleValue && state.selection?.sheet === sheetName) {
    pasteSingleValueAcrossSelection(sheetName, text);
    renderAll();
    focusCell(sheetName, startRow, startCol);
    return;
  }

  const rows = text.replace(/\r/g, "").split("\n").filter((row) => row.length);

  rows.forEach((rowText, rowOffset) => {
    const cells = rowText.split("\t");
    const targetRow = startRow + rowOffset;

    if (sheetName === "assets" && targetRow >= state.assets.length) {
      return;
    }
    if (sheetName === "images" && targetRow >= state.images.length) {
      return;
    }
    if (sheetName === "cards" && targetRow >= state.cards.length) {
      return;
    }

    while (state.sheets[sheetName].length <= targetRow) {
      state.sheets[sheetName].push(Array.from({ length: columns.length }, () => ""));
    }

    cells.forEach((cellText, colOffset) => {
      const targetCol = startCol + colOffset;
      if (targetCol < columns.length && !isReadOnlyCell(sheetName, targetCol)) {
        state.sheets[sheetName][targetRow][targetCol] = cellText;
      }
    });

    if (sheetName === "assets") {
      state.confirmedAssets = false;
      state.confirmedImages = false;
      syncAssetFromSheet(targetRow);
    }
    if (sheetName === "images") {
      state.confirmedImages = false;
      syncImageFromSheet(targetRow);
    }
    if (sheetName === "cards") {
      state.confirmedCards = false;
      syncCardFromSheet(targetRow);
    }
  });

  renderAll();
  const nextCell = document.querySelector(
    `.sheet td[data-sheet="${sheetName}"][data-row="${startRow}"][data-col="${startCol}"]`,
  );
  nextCell?.focus();
}

function pasteSingleValueAcrossSelection(sheetName, value) {
  const range = normalizeSelection(state.selection);
  const touchedRows = new Set();

  for (let row = range.startRow; row <= range.endRow; row += 1) {
    if (!isSheetRowInBounds(sheetName, row)) {
      continue;
    }

    for (let col = range.startCol; col <= range.endCol; col += 1) {
      if (col >= getSheetColumns(sheetName).length || isReadOnlyCell(sheetName, col)) {
        continue;
      }
      state.sheets[sheetName][row][col] = value;
      touchedRows.add(row);
    }
  }

  for (const row of touchedRows) {
    syncSheetRow(sheetName, row);
  }
}

function isSheetRowInBounds(sheetName, row) {
  if (sheetName === "assets") {
    return row < state.assets.length;
  }
  if (sheetName === "images") {
    return row < state.images.length;
  }
  if (sheetName === "cards") {
    return row < state.cards.length;
  }
  return row < state.sheets[sheetName].length;
}

function syncSheetRow(sheetName, row) {
  if (sheetName === "assets") {
    state.confirmedAssets = false;
    state.confirmedImages = false;
    syncAssetFromSheet(row);
  }
  if (sheetName === "images") {
    state.confirmedImages = false;
    syncImageFromSheet(row);
  }
  if (sheetName === "cards") {
    state.confirmedCards = false;
    syncCardFromSheet(row);
  }
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
  state.confirmedImages = false;
  syncImagesFromAssets();
  setStep("review");
}

function confirmImages() {
  state.confirmedImages = true;
  state.confirmedCards = false;
  syncCardsFromImages();
  setStep("cards");
}

function addCardRow() {
  const defaultTemplate = getDefaultTemplateAlias();
  const card = {
    id: crypto.randomUUID(),
    imageId: "",
    frontAlias: state.images[0]?.alias || "",
    backAlias: "",
    quantity: 1,
    templateAlias: defaultTemplate,
    placeholderName: getDefaultPlaceholder(defaultTemplate),
  };

  state.cards.push(card);
  state.selectedCardId = card.id;
  state.confirmedCards = false;
  invalidateGeneratedSheets();
  syncCardSheet();
  renderAll();
  focusCell("cards", state.cards.length - 1, 0);
}

function removeSelectedCardRow() {
  const rowsToRemove = getSelectedCardRows();
  if (!rowsToRemove.length) {
    return;
  }

  for (const index of [...rowsToRemove].reverse()) {
    state.cards.splice(index, 1);
  }

  const nextIndex = Math.min(rowsToRemove[0], state.cards.length - 1);
  state.selectedCardId = state.cards[nextIndex]?.id || null;
  state.confirmedCards = false;
  state.selection = null;
  invalidateGeneratedSheets();
  syncCardSheet();
  renderAll();
}

function getSelectedCardRows() {
  if (state.selection?.sheet === "cards") {
    const range = normalizeSelection(state.selection);
    const rows = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      if (state.cards[row]) {
        rows.push(row);
      }
    }
    return rows;
  }

  const index = state.cards.findIndex((card) => card.id === state.selectedCardId);
  return index === -1 ? [] : [index];
}

function exportYaml() {
  const yaml = toYaml({
    app: "Prep2Print",
    version: 2,
    exportedAt: new Date().toISOString(),
    currentStep: state.currentStep,
    confirmedAssets: state.confirmedAssets,
    confirmedImages: state.confirmedImages,
    confirmedCards: state.confirmedCards,
    templates: state.templates.map((template) => ({
      alias: template.alias,
      fileName: template.fileName,
      size: template.size,
      imageCount: template.imageCount,
      placeholders: template.placeholders,
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
    images: state.images.map((image) => ({
      alias: image.alias,
      assetFileName: image.assetFileName,
      assetId: image.assetId,
      index: image.index + 1,
      row: image.row + 1,
      column: image.col + 1,
    })),
    cards: state.cards.map((card) => ({
      frontAlias: card.frontAlias,
      backAlias: card.backAlias,
      quantity: card.quantity,
      templateAlias: card.templateAlias,
      placeholderName: card.placeholderName,
    })),
    sheets: {
      assets: state.sheets.assets,
      images: state.sheets.images,
      cards: state.sheets.cards,
    },
  });
  downloadFile("prep2print-project.yaml", yaml, "application/x-yaml");
}

async function handleYamlImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const project = parseYaml(text);
    await importProject(project);
  } catch (error) {
    alert(`Could not import YAML: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function importProject(project) {
  resetProjectState();

  state.confirmedAssets = Boolean(project.confirmedAssets);
  state.confirmedImages = Boolean(project.confirmedImages);
  state.confirmedCards = Boolean(project.confirmedCards);

  state.templates = (project.templates || []).map((template) =>
    restoreTemplate(template),
  );

  state.assets = await Promise.all(
    (project.assets || []).map(async (asset) => {
      const objectUrl = asset.dataUrl || "";
      const restored = {
        id: crypto.randomUUID(),
        fileName: asset.fileName || "asset",
        type: asset.type || "",
        size: Number(asset.size) || 0,
        uploadedAt: asset.uploadedAt || new Date().toISOString(),
        dataUrl: asset.dataUrl || "",
        objectUrl,
        rows: clampPositiveInteger(asset.rows, 1),
        columns: clampPositiveInteger(asset.columns, 1),
        imageCount: clampPositiveInteger(asset.imageCount, 1),
        width: Number(asset.width) || 0,
        height: Number(asset.height) || 0,
        status: "Ready",
      };

      if ((!restored.width || !restored.height) && objectUrl) {
        try {
          const dimensions = await loadImageDimensions(objectUrl);
          restored.width = dimensions.width;
          restored.height = dimensions.height;
        } catch {
          restored.status = "Error: The image could not be loaded.";
        }
      }

      return restored;
    }),
  );

  restoreAssetSheet(project.sheets?.assets);
  restoreImages(project.images || []);
  restoreImageSheet(project.sheets?.images);
  restoreCards(project.cards || []);
  restoreCardSheet(project.sheets?.cards);

  state.selectedTemplateId = state.templates[0]?.id || null;
  state.selectedAssetId = state.assets[0]?.id || null;
  state.selectedImageId = state.images[0]?.id || null;
  state.selectedCardId = state.cards[0]?.id || null;

  renderAll();
  setStep(canOpenStep(project.currentStep) ? project.currentStep : getLatestAvailableStep());
}

function resetProjectState() {
  state.currentStep = "templates";
  state.templates = [];
  state.selectedTemplateId = null;
  state.assets = [];
  state.selectedAssetId = null;
  state.images = [];
  state.selectedImageId = null;
  state.cards = [];
  state.selectedCardId = null;
  state.generatedSheets = [];
  state.generationWarnings = [];
  state.generationRequestId += 1;
  state.confirmedAssets = false;
  state.confirmedImages = false;
  state.confirmedCards = false;
  state.sheets = {
    assets: createSheet(assetColumns, 0),
    images: createSheet(imageColumns, 0),
    cards: createSheet(cardColumns, 0),
  };
  state.selection = null;
  state.isSelecting = false;
  state.editingCell = null;
  state.cardPreview.side = "front";
  hideAutocomplete();
  resetCardPreviewTransform();
}

function restoreTemplate(template) {
  const svgText = template.svg || "";
  let parsed = {
    imageCount: Number(template.imageCount) || 0,
    placeholders: template.placeholders || [],
    width: template.width || "",
    height: template.height || "",
    viewBox: template.viewBox || "",
  };

  if (svgText && (!parsed.placeholders.length || !parsed.imageCount)) {
    try {
      const documentSvg = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = documentSvg.querySelector("svg");
      const images = Array.from(svg?.querySelectorAll("image") || []);
      parsed = {
        imageCount: images.length,
        placeholders: images.map((image, index) => getPlaceholderName(image, index)),
        width: svg?.getAttribute("width") || parsed.width,
        height: svg?.getAttribute("height") || parsed.height,
        viewBox: svg?.getAttribute("viewBox") || parsed.viewBox,
      };
    } catch {
      // Keep serialized YAML values when SVG parsing is not available.
    }
  }

  return {
    id: crypto.randomUUID(),
    alias: template.alias || stripExtension(template.fileName || "template"),
    fileName: template.fileName || "template.svg",
    size: Number(template.size) || 0,
    uploadedAt: template.uploadedAt || new Date().toISOString(),
    imageCount: parsed.imageCount,
    placeholders: parsed.placeholders,
    width: parsed.width,
    height: parsed.height,
    viewBox: parsed.viewBox,
    svgText,
  };
}

function restoreImages(images) {
  const assetsByFileName = new Map(state.assets.map((asset) => [asset.fileName, asset]));
  state.images = images.map((image) => {
    const asset = assetsByFileName.get(image.assetFileName) || state.assets[0];
    const index = Math.max(0, Number(image.index || 1) - 1);
    const columns = Math.max(1, asset?.columns || 1);
    return {
      id: asset ? `${asset.id}:${index}` : crypto.randomUUID(),
      assetId: asset?.id || "",
      assetFileName: image.assetFileName || asset?.fileName || "",
      index,
      row: Math.max(0, Number(image.row || Math.floor(index / columns) + 1) - 1),
      col: Math.max(0, Number(image.column || (index % columns) + 1) - 1),
      alias: image.alias || "",
    };
  });

  if (!state.images.length && state.assets.length) {
    syncImagesFromAssets();
  } else {
    syncImageSheet();
  }
}

function restoreCards(cards) {
  state.cards = cards.map((card) => ({
    id: crypto.randomUUID(),
    imageId: getImageByAlias(card.frontAlias)?.id || "",
    frontAlias: card.frontAlias || "",
    backAlias: card.backAlias || "",
    quantity: clampPositiveInteger(card.quantity, 1),
    templateAlias: card.templateAlias || getDefaultTemplateAlias(),
    placeholderName: card.placeholderName || getDefaultPlaceholder(card.templateAlias),
  }));

  if (!state.cards.length && state.images.length) {
    syncCardsFromImages();
  } else {
    syncCardSheet();
  }
}

function restoreAssetSheet(rows) {
  if (!isValidSheet(rows, assetColumns.length)) {
    syncAssetSheet();
    return;
  }

  state.sheets.assets = normalizeSheet(rows, assetColumns.length).slice(0, state.assets.length);
  state.sheets.assets.forEach((_, index) => syncAssetFromSheet(index));
}

function restoreImageSheet(rows) {
  if (!isValidSheet(rows, imageColumns.length)) {
    syncImageSheet();
    return;
  }

  state.sheets.images = normalizeSheet(rows, imageColumns.length).slice(0, state.images.length);
  state.sheets.images.forEach((_, index) => syncImageFromSheet(index));
}

function restoreCardSheet(rows) {
  if (!isValidSheet(rows, cardColumns.length)) {
    syncCardSheet();
    return;
  }

  state.sheets.cards = normalizeSheet(rows, cardColumns.length).slice(0, state.cards.length);
  state.sheets.cards.forEach((_, index) => syncCardFromSheet(index));
}

function isValidSheet(rows, length) {
  return (
    Array.isArray(rows) &&
    rows.every((row) => Array.isArray(row) && row.length <= length)
  );
}

function normalizeSheet(rows, length) {
  return rows.map((row) =>
    Array.from({ length }, (_, index) => String(row[index] ?? "")),
  );
}

function getLatestAvailableStep() {
  if (canOpenStep("sheets")) {
    return "sheets";
  }
  if (canOpenStep("cards")) {
    return "cards";
  }
  if (canOpenStep("review")) {
    return "review";
  }
  if (canOpenStep("configure")) {
    return "configure";
  }
  if (canOpenStep("assets")) {
    return "assets";
  }
  return "templates";
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

function parseYaml(text) {
  const lines = preprocessYamlLines(text);
  const [value] = parseYamlBlock(lines, 0, 0);
  return value || {};
}

function preprocessYamlLines(text) {
  const sourceLines = text.replace(/\r/g, "").split("\n");
  const lines = [];

  for (let index = 0; index < sourceLines.length; index += 1) {
    const raw = sourceLines[index];
    if (!raw.trim()) {
      continue;
    }

    const indent = raw.match(/^ */)[0].length;
    const content = raw.trimEnd().slice(indent);

    if (content.endsWith(": |") || content === "|") {
      const keyPrefix = content === "|" ? "|" : content.slice(0, -2).trimEnd();
      const blockIndent = sourceLines[index + 1]?.match(/^ */)?.[0].length ?? indent + 2;
      const block = [];

      while (index + 1 < sourceLines.length) {
        const next = sourceLines[index + 1];
        if (next.trim() && next.match(/^ */)[0].length < blockIndent) {
          break;
        }
        index += 1;
        block.push(next.slice(Math.min(blockIndent, next.length)));
      }

      lines.push({
        indent,
        text: content === "|" ? JSON.stringify(block.join("\n")) : `${keyPrefix} ${JSON.stringify(block.join("\n"))}`,
      });
    } else {
      lines.push({ indent, text: content.trim() });
    }
  }

  return lines;
}

function parseYamlBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length) {
    return [{}, startIndex];
  }

  if (lines[startIndex].text.startsWith("- ")) {
    return parseYamlArray(lines, startIndex, indent);
  }
  return parseYamlObject(lines, startIndex, indent);
}

function parseYamlObject(lines, startIndex, indent) {
  const object = {};
  let index = startIndex;

  while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith("- ")) {
    const { key, value } = splitYamlKeyValue(lines[index].text);
    if (value === "") {
      const [nested, nextIndex] = parseYamlBlock(lines, index + 1, indent + 2);
      object[key] = nested;
      index = nextIndex;
    } else {
      object[key] = parseYamlScalar(value);
      index += 1;
    }
  }

  return [object, index];
}

function parseYamlArray(lines, startIndex, indent) {
  const array = [];
  let index = startIndex;

  while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith("- ")) {
    const itemText = lines[index].text.slice(2);

    if (!itemText) {
      const [nested, nextIndex] = parseYamlBlock(lines, index + 1, indent + 2);
      array.push(nested);
      index = nextIndex;
    } else if (itemText.startsWith("- ")) {
      const nested = [parseYamlScalar(itemText.slice(2))];
      index += 1;

      while (
        index < lines.length &&
        lines[index].indent === indent + 2 &&
        lines[index].text.startsWith("- ")
      ) {
        nested.push(parseYamlScalar(lines[index].text.slice(2)));
        index += 1;
      }

      array.push(nested);
    } else if (itemText.includes(":")) {
      const { key, value } = splitYamlKeyValue(itemText);
      const item = {};
      if (value === "") {
        const [nested, nextIndex] = parseYamlBlock(lines, index + 1, indent + 2);
        item[key] = nested;
        index = nextIndex;
      } else {
        item[key] = parseYamlScalar(value);
        index += 1;
      }

      while (index < lines.length && lines[index].indent === indent + 2 && !lines[index].text.startsWith("- ")) {
        const next = splitYamlKeyValue(lines[index].text);
        if (next.value === "") {
          const [nested, nextIndex] = parseYamlBlock(lines, index + 1, indent + 4);
          item[next.key] = nested;
          index = nextIndex;
        } else {
          item[next.key] = parseYamlScalar(next.value);
          index += 1;
        }
      }

      array.push(item);
    } else {
      array.push(parseYamlScalar(itemText));
      index += 1;
    }
  }

  return [array, index];
}

function splitYamlKeyValue(text) {
  const separator = text.indexOf(":");
  return {
    key: text.slice(0, separator).trim(),
    value: text.slice(separator + 1).trim(),
  };
}

function parseYamlScalar(value) {
  if (value === "null") {
    return null;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "[]") {
    return [];
  }
  if (value === '""') {
    return "";
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
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
elements.confirmImagesButton.addEventListener("click", confirmImages);
elements.addCardButton.addEventListener("click", addCardRow);
elements.removeCardButton.addEventListener("click", removeSelectedCardRow);
elements.frontSideButton.addEventListener("click", () => setCardPreviewSide("front"));
elements.backSideButton.addEventListener("click", () => setCardPreviewSide("back"));
elements.zoomOutButton.addEventListener("click", () => setCardPreviewZoom(state.cardPreview.zoom - 0.5));
elements.zoomResetButton.addEventListener("click", resetCardPreviewTransform);
elements.zoomInButton.addEventListener("click", () => setCardPreviewZoom(state.cardPreview.zoom + 0.5));
elements.cardPreviewViewport.addEventListener("mousedown", startCardPreviewPan);
document.addEventListener("mousemove", moveCardPreviewPan);
document.addEventListener("mouseup", endCardPreviewPan);
elements.importYamlButton.addEventListener("click", () => elements.importYamlInput.click());
elements.importYamlInput.addEventListener("change", handleYamlImport);
elements.exportPdfButton.addEventListener("click", exportGeneratedSheetsPdf);
elements.exportYamlButton.addEventListener("click", exportYaml);
document.addEventListener("mouseup", endSelection);
document.addEventListener("copy", copySelection);
document.addEventListener("paste", pasteCells);

renderAll();
