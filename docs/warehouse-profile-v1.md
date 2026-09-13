# WarehouseProfile v1

A profile is public configuration. It must not contain users, password material, audit records, shared-folder credentials, absolute private paths, or operational datasets.

The required fields are `schemaVersion`, `id`, `name`, `categories`, `snapshotCategories`, `classifiers`, and `specialLocations`. Optional fields configure `unknownCategoryPolicy`, `segregation`, `putaway`, `dataMappings`, `modules`, and `zoneDetection`.

Categories have stable IDs, labels, display names, aliases, and controlled semantic style tokens. IDs, labels, and aliases share one case-insensitive namespace. Classifiers use `any`, `all`, and `exclude` arrays of conditions over `pn`, `desc`, `category`, `batch`, `bin`, `hu`, `qty`, or `text`. Supported operators are `equals`, `startsWith`, `contains`, `endsWith`, and `regex`.

Special locations have IDs, labels, aliases, optional match expressions, types, tags, and behavior flags. Snapshot categories reference category IDs. Invalid profiles fail startup with a visible validation error; they are never silently replaced.

The electronics profile includes these aliases and classifiers: RAW/BATTERY/PACKING, GR-ZONE, PN prefixes 52 and 90, LCD prefix 57 or DISPLAY, with UNDERDISPLAY excluded.

## Importing another warehouse's layout

Paste tab-separated data, such as cells copied from a spreadsheet. Set `dataMappings.master` and `dataMappings.detail` to your column headers, or use zero-based column indices for headerless data. Header names are case-insensitive, ignore spaces and punctuation, and support Unicode letters and numbers. Headers must be unique after normalization; ambiguous or missing mapped columns cause affected rows to be skipped with a warning rather than using a different column.

For example, this compact master mapping reads three columns in any order when the named headers are included:

```json
{
  "dataMappings": {
    "master": {
      "bin": "Location",
      "palletCount": "Pallets",
      "category": "Type",
      "binCategory": "Type"
    },
    "categoryQuantityColumns": {}
  }
}
```

Include every configured named column in the header row, including category quantity columns. Repeated copies of that header are ignored. Empty cells retain their positions; an explicitly mapped blank cell is valid, while a mapped column beyond the end of a row is missing. Rows with an empty mapped bin are skipped. Item numbers and descriptions may contain `PN` or `Storage Bin` without being mistaken for headers.

Fields without mappings keep the legacy positional defaults. For compact detail layouts, explicitly map all fields (`partNumber`, `description`, `category`, `quantity`, `batch`, `bin`, and `handlingUnit`); include blank columns for unused batch or handling-unit values. Keep `electronics-demo.json` selected for the existing electronics layout.

Optional mappings can also be `null` to deliberately return an empty value: master `category` and `binCategory`, or detail `description`, `batch`, and `handlingUnit`. The import assistant presents this as **Not used**. Required mappings cannot be null. Activated profiles are saved in `warehouse_profile.json` in the warehouse folder.

## Classifier quantities and high-value stock

Each parsed bin has `classifierQuantities`, keyed by classifier ID and summed from matching detail quantities. Classifiers receive the complete detail record, including category, batch, bin, handling unit and quantity. `highValueQty` counts each matching item's quantity once, even when multiple classifiers tagged `high-value` match it. Receiving statistics also expose these fields.

High-value filters, totals, legends and badges use the profile's `high-value` tags rather than fixed electronics IDs. The `pcbaQty`, `phoneQty` and `lcdQty` fields remain compatibility aliases. Classifier totals can overlap and should not be added together as a distinct-stock total.

## Category identifiers

Setup-generated category IDs preserve Unicode letters, numbers and combining marks, with NFC normalization. Chinese, Thai and accented labels retain distinct IDs. Labels containing only symbols use a deterministic code-point identifier, so reordering categories does not change their IDs. Canonically equivalent duplicate names are rejected by validation. Snapshot references are generated from the final category IDs. Existing saved profile IDs are not rewritten.

