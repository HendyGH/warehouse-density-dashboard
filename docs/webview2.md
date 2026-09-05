# Windows WebView2 packaging

The Windows bundle uses Tauri's `downloadBootstrapper` install mode. The NSIS installer downloads the WebView2 bootstrapper when the target machine does not already have the runtime, then installs the dashboard. Release builds must run the Windows Tauri build in CI and retain the generated installer alongside its checksums.

This mode keeps the repository free of a machine-specific fixed runtime payload. Offline deployment requires a separately approved WebView2 offline installer process; it is outside the application source tree.

