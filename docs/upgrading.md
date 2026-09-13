# Upgrading and recovery

Back up the entire warehouse folder before upgrading. Install the newer app and open it using the same Windows account and warehouse folder.

Existing saved-data filenames, preference keys, signing material and the application identifier are retained for compatibility. These internal identifiers are not product branding; do not rename them manually.

Existing accounts continue to require sign-in. Joining an existing warehouse does not switch off accounts. Damaged account files block startup instead of creating a replacement administrator.

New or updated profiles are stored in `warehouse_profile.json` in the warehouse folder. Other computers read this profile on startup. Older custom profiles stored only on one computer can be exported from **Profile**, then activated using the profile import control. Keep all computers sharing a warehouse on the same app version.

For recovery, close the app on all computers and restore the warehouse folder from a trusted backup. Keep a copy of the damaged folder for investigation.

Version 2.1.1 also blocks startup if warehouse state contains invalid JSON or its root is not an object. An absent state file is treated as a new warehouse; a damaged file is never silently replaced with empty data. Editing and automatic saves remain disabled until state loads successfully.
