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
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomResetButton: document.querySelector("#zoomResetButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  autocompleteMenu: document.querySelector("#autocompleteMenu"),
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
  return state.confirmedImages && state.cards.length > 0;
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
    const text = await file.text();
    try {
      const template = parseSvgFile(file, text);
      state.templates.push(template);
      state.selectedTemplateId = template.id;
    } catch (error) {
      const template = {
        id: crypto.randomUUID(),
        alias: stripExtension(file.name),
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
      <img class="asset-stage-image" alt="" src="${asset.objectUrl}" />
      <div class="asset-grid-overlay" style="--grid-cols: ${cols}; --grid-rows: ${rows};">
        ${tiles.join("")}
      </div>
    </div>
  `;
}

function getSelectedAsset() {
  return state.assets.find((asset) => asset.id === state.selectedAssetId);
}

function renderImageReviewPreview() {
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
  elements.imageReviewPreview.innerHTML = asset
    ? buildImageSlice(selected, asset)
    : '<div class="empty-preview">Asset missing</div>';
}

function buildImageSlice(image, asset) {
  const cols = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const tileWidth = asset.width ? asset.width / cols : 1;
  const tileHeight = asset.height ? asset.height / rows : 1;
  const ratio = tileWidth / tileHeight;
  const x = cols === 1 ? "0%" : `${(image.col / (cols - 1)) * 100}%`;
  const y = rows === 1 ? "0%" : `${(image.row / (rows - 1)) * 100}%`;

  return `
    <div
      class="image-slice-stage"
      style="--slice-ratio: ${ratio}; --grid-cols: ${cols}; --grid-rows: ${rows}; --slice-x: ${x}; --slice-y: ${y}; --asset-image: url('${asset.objectUrl.replace(/'/g, "%27")}');"
      role="img"
      aria-label="${escapeHtml(image.alias)}"
    ></div>
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
    applyCardPreviewTransform();
    return;
  }

  elements.cardPreviewTitle.textContent = selected.frontAlias || "Untitled card";
  elements.cardPreviewMeta.textContent = `${selected.quantity} copies · ${
    selected.templateAlias || "no template"
  } · ${selected.placeholderName || "no placeholder"}`;

  try {
    elements.cardPreview.innerHTML = await buildCardTemplatePreview(selected);
    const svg = elements.cardPreview.querySelector("svg");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${selected.frontAlias} card preview`);
    }
  } catch (error) {
    elements.cardPreview.innerHTML = `<div class="empty-preview">${escapeHtml(
      error.message,
    )}</div>`;
  }

  applyCardPreviewTransform();
}

async function buildCardTemplatePreview(card) {
  const template = getTemplateByAlias(card.templateAlias);
  const frontImage = getImageByAlias(card.frontAlias);

  if (!template) {
    throw new Error("Template alias not found.");
  }
  if (!frontImage) {
    throw new Error("Front image alias not found.");
  }

  const imageDataUrl = await getImageSliceDataUrl(frontImage);
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

  targets.slice(0, card.quantity).forEach((image) => {
    image.setAttribute("href", imageDataUrl);
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageDataUrl);
  });

  return new XMLSerializer().serializeToString(svg);
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
    throw new Error("Asset for front image not found.");
  }

  const cols = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const source = await loadImageElement(asset.objectUrl);
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
elements.confirmImagesButton.addEventListener("click", confirmImages);
elements.addCardButton.addEventListener("click", addCardRow);
elements.removeCardButton.addEventListener("click", removeSelectedCardRow);
elements.zoomOutButton.addEventListener("click", () => setCardPreviewZoom(state.cardPreview.zoom - 0.5));
elements.zoomResetButton.addEventListener("click", resetCardPreviewTransform);
elements.zoomInButton.addEventListener("click", () => setCardPreviewZoom(state.cardPreview.zoom + 0.5));
elements.cardPreviewViewport.addEventListener("mousedown", startCardPreviewPan);
document.addEventListener("mousemove", moveCardPreviewPan);
document.addEventListener("mouseup", endCardPreviewPan);
elements.exportYamlButton.addEventListener("click", exportYaml);
document.addEventListener("mouseup", endSelection);
document.addEventListener("copy", copySelection);
document.addEventListener("paste", pasteCells);

renderAll();
