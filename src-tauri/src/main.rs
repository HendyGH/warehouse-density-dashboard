use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Default, Clone)]
struct Config { db_folder: Option<String> }

fn config_path() -> PathBuf {
    let mut p = dirs::config_dir().unwrap_or(std::env::temp_dir());
    p.push("WarehouseDashboard");
    let _ = fs::create_dir_all(&p);
    p.push("config.json");
    p
}

fn read_config() -> Config {
    if let Ok(s) = fs::read_to_string(config_path()) {
        if let Ok(c) = serde_json::from_str::<Config>(&s) { return c; }
    }
    Config::default()
}

fn write_config(c: &Config) -> Result<(), String> {
    let s = serde_json::to_string_pretty(c).map_err(|e| e.to_string())?;
    fs::write(config_path(), s).map_err(|e| e.to_string())
}

fn db_dir() -> Result<PathBuf, String> {
    match read_config().db_folder {
        Some(f) => Ok(PathBuf::from(f)),
        None => Err("no_db_folder".to_string()),
    }
}

#[tauri::command]
fn get_config() -> Config { read_config() }

#[tauri::command]
fn set_db_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    let mut c = read_config();
    c.db_folder = Some(path);
    write_config(&c)
}

#[tauri::command]
fn read_file_named(name: String) -> Result<String, String> {
    let mut p = db_dir()?;
    p.push(&name);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(_) => Ok(String::new()),
    }
}

#[tauri::command]
fn write_file_named(name: String, content: String) -> Result<(), String> {
    let dir = db_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut tmp = dir.clone();
    tmp.push(format!("{}.tmp", name));
    let mut fin = dir.clone();
    fin.push(&name);
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &fin).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_config, set_db_folder, read_file_named, write_file_named])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

