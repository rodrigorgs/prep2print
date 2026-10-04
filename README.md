# Prep2Print

Prep2Print is a static web app for preparing print-to-cut card and board game sheets for Brother ScanNCut workflows.

The app lets you upload SVG print templates, upload image assets, slice assets into individual images, map those images to cards, generate front/back print sheets, and export the project configuration as YAML for later import.

## Running Locally

This project is plain HTML, CSS, and JavaScript. There is no build step.

```sh
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/
```

## Project YAML Format

The app exports a single YAML file named `prep2print-project.yaml`. The file is intended to be re-imported by Prep2Print and contains both project data and spreadsheet snapshots.

The top-level structure is:

```yaml
app: Prep2Print
version: 2
exportedAt: "2026-07-02T12:00:00.000Z"
currentStep: sheets
confirmedAssets: true
confirmedImages: true
confirmedCards: false
templates: []
assets: []
images: []
cards: []
sheets:
  assets: []
  images: []
  cards: []
```

### Top-Level Fields

- `app`: Always `Prep2Print`.
- `version`: YAML schema version. The current exporter writes `2`.
- `exportedAt`: ISO timestamp generated at export time.
- `currentStep`: Last active app step. Expected values are `templates`, `assets`, `configure`, `review`, `cards`, or `sheets`.
- `confirmedAssets`: Whether the asset configuration step had been confirmed.
- `confirmedImages`: Whether the image review step had been confirmed.
- `confirmedCards`: Reserved by the current app state. It is exported and imported, but card editing currently remains available without a separate confirmation step.
- `templates`: Uploaded SVG print templates.
- `assets`: Uploaded image asset files.
- `images`: Individual reviewed images derived from assets.
- `cards`: Card rows mapping fronts, backs, quantities, templates, and placeholders.
- `sheets`: Spreadsheet snapshots used to restore editable grid state.

## Templates

Each item in `templates` represents one uploaded SVG print template.

```yaml
templates:
  - alias: poker-front
    fileName: poker-front.svg
    size: 12345
    imageCount: 8
    placeholders:
      - card_front
      - card_front
    width: 210mm
    height: 297mm
    viewBox: 0 0 793.70082 1122.5197
    uploadedAt: "2026-07-02T12:00:00.000Z"
    svg: |
      <svg>...</svg>
```

Template fields:

- `alias`: Stable name used by card rows. When replacing a template file in the UI, the alias is preserved.
- `fileName`: Original SVG file name.
- `size`: File size in bytes.
- `imageCount`: Number of `<image>` elements found in the SVG.
- `placeholders`: Placeholder names derived from SVG image references, IDs, or labels.
- `width`: SVG root `width` attribute.
- `height`: SVG root `height` attribute.
- `viewBox`: SVG root `viewBox` attribute.
- `uploadedAt`: ISO timestamp from the upload/import flow.
- `svg`: Full SVG text. This is required to restore the template without re-uploading the file.

## Assets

Each item in `assets` represents one uploaded image file.

```yaml
assets:
  - fileName: cards.png
    type: image/png
    size: 456789
    rows: 3
    columns: 3
    imageCount: 8
    width: 2048
    height: 2048
    uploadedAt: "2026-07-02T12:00:00.000Z"
    dataUrl: data:image/png;base64,...
```

Asset fields:

- `fileName`: Original asset file name.
- `type`: MIME type, such as `image/png` or `image/jpeg`.
- `size`: File size in bytes.
- `rows`: Number of slicing rows configured by the user.
- `columns`: Number of slicing columns configured by the user.
- `imageCount`: Number of slices to use, in reading order.
- `width`: Source image width in pixels.
- `height`: Source image height in pixels.
- `uploadedAt`: ISO timestamp from the upload/import flow.
- `dataUrl`: Full image data URL. This is required to restore previews and generated sheets without re-uploading the asset.

When replacing an asset file in the UI, `rows`, `columns`, and `imageCount` are preserved.

## Images

The `images` list stores the reviewed image slices derived from assets.

```yaml
images:
  - alias: cards_01
    rotation: 0
    assetFileName: cards.png
    assetId: "internal-id-at-export-time"
    index: 1
    row: 1
    column: 1
```

Image fields:

- `alias`: User-editable image alias used by card rows.
- `rotation`: Clockwise rotation in degrees applied to the image bitmap before it is inserted. The template placeholder itself is not rotated. Defaults to `0`.
- `assetFileName`: Asset file name used to reconnect the image to an imported asset.
- `assetId`: Internal asset ID at export time. It is exported for reference, but import primarily reconnects by `assetFileName`.
- `index`: One-based image index within the asset.
- `row`: One-based slice row.
- `column`: One-based slice column.

If `images` is empty but assets are present, the app can regenerate image rows from the asset slicing configuration.

## Cards

The `cards` list stores the card sheet rows.

```yaml
cards:
  - frontAlias: cards_01
    backAlias: backs_01
    quantity: 2
    templateAlias: poker-front
    placeholderName: card_front
```

Card fields:

- `frontAlias`: Alias of the image used on the front of the card.
- `backAlias`: Alias of the image used on the back of the card. It may be empty.
- `quantity`: Number of copies to place in generated sheets.
- `templateAlias`: Template alias to use for this card.
- `placeholderName`: Placeholder image name in the template.

Generated print sheets are not saved in YAML. They are rebuilt from `templates`, `assets`, `images`, and `cards`.

## Spreadsheet Snapshots

The `sheets` object stores the editable grid values exactly as shown in the app.

```yaml
sheets:
  assets:
    - - cards.png
      - "3"
      - "3"
      - "8"
  images:
    - - cards.png
      - "1"
      - cards_01
      - "0"
  cards:
    - - cards_01
      - backs_01
      - "2"
      - poker-front
      - card_front
```

Sheet columns are:

- `sheets.assets`: `File Name`, `Rows`, `Columns`, `Images`
- `sheets.images`: `Asset`, `Index`, `Alias`, `Rotation (deg)`
- `sheets.cards`: `Front`, `Back`, `Qty`, `Template`, `Placeholder`

On import, valid sheet snapshots are applied after canonical objects are restored. If a sheet snapshot is missing or invalid, the app rebuilds that sheet from `assets`, `images`, or `cards`.

## Import Notes

- YAML is parsed by the app's built-in lightweight parser, not a full YAML library.
- The exporter emits the supported subset of YAML, and imported files should generally follow the same structure.
- Multiline SVG values are supported through block scalars.
- Scalars, arrays, nested objects, booleans, numbers, empty arrays, and quoted JSON-style strings are supported.
- Asset image data must be present in `dataUrl` for imported projects to render previews and generated sheets without re-uploading files.

## Generated Sheets

Generated sheets are derived at runtime:

- Cards are placed into their configured template until matching placeholder slots are full.
- A new sheet is created when no eligible placeholder remains.
- Front and back pages are generated alternately for PDF printing.
- Back sheets are horizontally mirrored, and inserted back images are mirrored again so the back artwork remains readable while aligning behind the front card positions.
- SVG elements whose effective `stroke` or `fill` color starts with `#123456` or `123456` are hidden in generated sheets.
