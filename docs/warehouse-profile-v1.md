# WarehouseProfile v1

A profile is public configuration. It must not contain users, password material, audit records, shared-folder credentials, absolute private paths, or operational datasets.

The required fields are `schemaVersion`, `id`, `name`, `categories`, `snapshotCategories`, `classifiers`, and `specialLocations`. Optional fields configure `unknownCategoryPolicy`, `segregation`, `putaway`, `dataMappings`, `modules`, and `zoneDetection`.

Categories have stable IDs, labels, display names, aliases, and controlled semantic style tokens. IDs, labels, and aliases share one case-insensitive namespace. Classifiers use `any`, `all`, and `exclude` arrays of conditions over `pn`, `desc`, `category`, `batch`, `bin`, `hu`, `qty`, or `text`. Supported operators are `equals`, `startsWith`, `contains`, `endsWith`, and `regex`.

Special locations have IDs, labels, aliases, optional match expressions, types, tags, and behavior flags. Snapshot categories reference category IDs. Invalid profiles fail startup with a visible validation error; they are never silently replaced.

The electronics compatibility profile keeps the v35 aliases and classifiers: RAW/BATTERY/PACKING, GR-ZONE, PN prefixes 52 and 90, LCD prefix 57 or DISPLAY, with UNDERDISPLAY excluded.

