===================================================================
 WAREHOUSE DASHBOARD v35 - APLIKASI TAURI (PORTABLE, TANPA SERVER)
 Panduan build + cara pakai
===================================================================

APA INI
-------
Aplikasi desktop (Tauri) yang membungkus dashboard v35. Datanya TIDAK
disimpan di dalam aplikasi, tapi di satu FOLDER BERSAMA di server (Y:).
- Buka pertama kali -> diminta tempel path folder DB (mis. drive Y:).
- Login: akun pertama otomatis jadi ADMIN.
- ADMIN  = bisa edit data + buat/hapus akun.
- VIEWER = hanya melihat (semua tombol edit dimatikan, tidak bisa simpan).
- Semua orang yang menjalankan app dan menunjuk ke folder yang sama
  akan melihat data yang sama. Tanpa server, tanpa buka port, tanpa IT.

ISI PROJECT
-----------
  package.json                      -> script tauri + dev dependency CLI
  src/index.html                    -> frontend v35 (sudah disisipi tauri_boot.js)
  src/tauri_boot.js                 -> login, peran, simpan ke folder DB
  src-tauri/Cargo.toml              -> dependency Rust
  src-tauri/build.rs
  src-tauri/tauri.conf.json          -> konfigurasi Tauri v2
  src-tauri/capabilities/default.json
  src-tauri/src/main.rs             -> perintah baca/tulis file di folder DB
  src-tauri/icons/                  -> (kosong, diisi saat build, lihat langkah 3)

SYARAT BUILD (di mesin Windows yang bebas install)
--------------------------------------------------
  1. Node.js 18+           : https://nodejs.org
  2. Rust (rustup)         : https://rustup.rs
  3. Microsoft C++ Build Tools (Desktop development with C++)
     -> dari Visual Studio Build Tools
  (Instalasi rustup + Node bisa per-user tanpa admin; VS Build Tools
   biasanya butuh admin.)

LANGKAH BUILD
-------------
  1. Ekstrak folder ini, buka terminal DI DALAM folder tauri_v35.
  2. npm install
  3. Buat ikon (wajib, kalau belum ada):
       npm run tauri icon path/ke/logo.png
     (logo PNG persegi apa saja; ini mengisi src-tauri/icons otomatis)
  4. Build:
       npm run tauri build
  5. Hasilnya:
     - EXE PORTABLE (langsung jalan, tanpa install):
         src-tauri/target/release/warehouse-dashboard.exe
     - Installer .exe (opsional):
         src-tauri/target/release/bundle/nsis/*.exe

  Untuk mencoba tanpa build penuh: npm run tauri dev

CATATAN WEBVIEW2
----------------
Tauri di Windows butuh runtime WebView2 (umumnya sudah ada di Win10/11).
Agar 100% jalan di PC yang belum punya WebView2, ubah bundle di
tauri.conf.json menjadi menyertakan runtime tetap (fixedRuntime), atau
pastikan WebView2 Evergreen sudah terpasang di PC tujuan.

CARA PAKAI (setelah dapat .exe)
-------------------------------
  1. Taruh FOLDER DB di server, mis: Y:\...\Warehouse_DB (folder kosong).
  2. Jalankan warehouse-dashboard.exe (boleh dicopy ke lokal tiap PC).
  3. Pertama kali: tempel path folder DB tadi -> Simpan.
  4. Buat akun admin pertama.
  5. Admin: paste data -> Generate -> tersimpan otomatis ke folder DB.
     Klik Kelola Akun untuk menambah viewer/admin.
  6. Rekan: jalankan .exe, arahkan ke folder DB yang sama, login sebagai
     viewer -> lihat data terkini (read-only).

KEAMANAN (penting, jujur)
-------------------------
- Login admin/viewer adalah kontrol di aplikasi. File data & akun ada
  sebagai file JSON di folder DB, jadi siapa pun yang punya AKSES FOLDER
  bisa membukanya langsung.
- Pengaman sebenarnya = IZIN FOLDER (NTFS) di Y:. Minta IT beri viewer
  akses read-only ke folder DB (ini permintaan wajar, beda dari buka port).
- Password disimpan sebagai hash PBKDF2-SHA256 (bukan teks polos).
- Agar file DB tidak korup: hanya admin yang menulis; viewer tidak pernah
  menulis. Format JSON + tulis-atomik (tmp lalu rename).

===================================================================
 PROMPT SIAP-TEMPEL UNTUK HERMES (kalau perlu build otomatis)
===================================================================
Tolong build project Tauri v2 berikut menjadi executable Windows (.exe)
portable untuk x86_64.
- Ini project Tauri v2 desktop. Frontend statis ada di folder src/
  (index.html + tauri_boot.js), backend Rust di src-tauri/.
- Jangan ubah logika; cukup pastikan bisa dikompilasi.
- Langkah: npm install; jika ikon belum ada jalankan `npm run tauri icon`
  dengan PNG persegi apa saja; lalu `npm run tauri build`.
- Kembalikan file: src-tauri/target/release/warehouse-dashboard.exe
  (dan installer di target/release/bundle/nsis/ jika ada).
- Jika ada error versi/permission Tauri v2 (mis. capabilities atau tipe
  return command), sesuaikan seperlunya agar build sukses tanpa mengubah
  perilaku aplikasi.
===================================================================

