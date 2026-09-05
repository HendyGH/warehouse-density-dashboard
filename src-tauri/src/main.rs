use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default, Clone)]
struct Config {
    db_folder: Option<String>,
}

fn config_path() -> PathBuf {
    let mut p = dirs::config_dir().unwrap_or(std::env::temp_dir());
    p.push("WarehouseDashboard");
    let _ = fs::create_dir_all(&p);
    p.push("config.json");
    p
}

fn read_config() -> Config {
    if let Ok(s) = fs::read_to_string(config_path()) {
        if let Ok(c) = serde_json::from_str::<Config>(&s) {
            return c;
        }
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

fn safe_file_name(name: &str) -> Result<(), String> {
    let value = name.trim();
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
    {
        return Err("invalid_file_name".to_string());
    }
    if PathBuf::from(value).is_absolute() {
        return Err("absolute_paths_are_not_allowed".to_string());
    }
    Ok(())
}

fn local_dir() -> PathBuf {
    let mut p = dirs::config_dir().unwrap_or(std::env::temp_dir());
    p.push("WarehouseDashboard");
    p.push("local");
    let _ = fs::create_dir_all(&p);
    p
}

#[tauri::command]
fn get_config() -> Config {
    read_config()
}

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
    safe_file_name(&name)?;
    let mut p = db_dir()?;
    p.push(&name);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(_) => Ok(String::new()),
    }
}

#[tauri::command]
fn write_file_named(name: String, content: String) -> Result<(), String> {
    safe_file_name(&name)?;
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

#[tauri::command]
fn read_local_file_named(name: String) -> Result<String, String> {
    safe_file_name(&name)?;
    let mut p = local_dir();
    p.push(&name);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(_) => Ok(String::new()),
    }
}

#[tauri::command]
fn write_local_file_named(name: String, content: String) -> Result<(), String> {
    safe_file_name(&name)?;
    let dir = local_dir();
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
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_db_folder,
            read_file_named,
            write_file_named,
            read_local_file_named,
            write_local_file_named
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

