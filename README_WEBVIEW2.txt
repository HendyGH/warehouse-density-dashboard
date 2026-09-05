===================================================================
 MENGATASI MASALAH WEBVIEW2 (agar .exe jalan tanpa install & offline)
===================================================================

KENAPA ERROR
------------
WebView2 = mesin render HTML yang dipakai Tauri. Tidak otomatis ikut ke
dalam .exe kecuali diminta. Build Hermes yang lama belum menyertakannya,
jadi di PC yang belum punya WebView2, app gagal terbuka.

CEK DULU (sering sudah ada)
---------------------------
Di PC target, buka PowerShell dan jalankan:
  reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv
Kalau muncul nomor versi -> WebView2 sudah ada, .exe lama harusnya jalan.
Kalau kosong/error -> pakai cara BUNDLE di bawah.

SOLUSI: BUNDLE WEBVIEW2 (fixedRuntime) - PALING AMAN, TETAP PORTABLE
-------------------------------------------------------------------
tauri.conf.json SUDAH diubah ke mode fixedRuntime:
  bundle.windows.webviewInstallMode = { type: fixedRuntime,
      path: ./Microsoft.WebView2.FixedVersionRuntime/ }
Artinya runtime WebView2 dikirim bersama .exe -> TIDAK perlu install,
TIDAK perlu internet di PC kantor.

LANGKAH TAMBAHAN SEBELUM BUILD (WAJIB untuk fixedRuntime):
  1. Download "WebView2 Fixed Version" (Evergreen Standalone bukan yang ini;
     pilih FIXED VERSION) dari:
       https://developer.microsoft.com/microsoft-edge/webview2/
     -> bagian "Fixed Version", pilih arsitektur x64 (cab file).
  2. Ekstrak isinya sehingga menjadi folder:
       src-tauri/Microsoft.WebView2.FixedVersionRuntime/
     (di dalamnya ada msedgewebview2.exe dll)
  3. Baru jalankan: npm run tauri build

Hasil build kini membawa runtime tsb -> jalan di PC tanpa WebView2.

ALTERNATIF (kalau tak mau download runtime):
  - offlineInstaller: ganti type menjadi "offlineInstaller". Ini membuat
    INSTALLER .exe yang memasang WebView2 saat instalasi TANPA internet,
    tapi hasilnya installer (bukan portable murni).
  - downloadBootstrapper (default lama): butuh internet saat pertama pasang
    -> TIDAK cocok untuk PC kantor terkunci. Jangan pakai.

RINGKAS: untuk kebutuhanmu (portable + offline + PC terkunci) gunakan
fixedRuntime (sudah diset). Cukup sertakan folder runtime lalu build.

===================================================================
 PROMPT SIAP-TEMPEL UNTUK HERMES (versi WebView2 fixedRuntime)
===================================================================
Tolong build ulang project Tauri v2 ini menjadi .exe Windows x64 portable
yang SUDAH menyertakan WebView2 (offline, tanpa install di PC target).
- tauri.conf.json sudah diset bundle.windows.webviewInstallMode = fixedRuntime
  dengan path ./Microsoft.WebView2.FixedVersionRuntime/
- Download WebView2 "Fixed Version" runtime (x64) dari situs resmi Microsoft,
  ekstrak ke src-tauri/Microsoft.WebView2.FixedVersionRuntime/ sebelum build.
- Lalu: npm install; (jika ikon belum ada) npm run tauri icon <png persegi>;
  npm run tauri build.
- Kembalikan hasil di src-tauri/target/release/ beserta folder runtime
  WebView2 yang menyertai .exe, dalam bentuk zip agar bisa dijalankan
  langsung tanpa install.
- Jangan ubah logika aplikasi; sesuaikan hanya jika ada error versi Tauri v2.
===================================================================

