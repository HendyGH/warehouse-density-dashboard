# Migrating from v35

The v2 application continues to use `warehouse_state_v35.json`, `users_v35.json`, and `audit_v35.json`. Authentication roles, PBKDF2 password hashing, account integrity checks, audit logging, idle logout, snapshots, NPI, Lab, Floor Sheet, Action Center, and putaway behavior remain compatible.

On first v2 startup, an existing state file is treated as an electronics workflow and receives profile metadata when it is next saved. The application does not rename or destructively rewrite legacy state. Invalid state is preserved and reported instead of being overwritten.

Use `electronics-demo.json` for a direct v35-compatible workflow. Use `generic.json` as a neutral starting point for a new warehouse. Validate any custom profile before activation.

