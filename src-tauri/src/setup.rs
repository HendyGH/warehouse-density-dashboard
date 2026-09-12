use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

const SETTINGS: &str = "warehouse_settings.json";
const USERS: &str = "users_v35.json";
const STATE: &str = "warehouse_state_v35.json";

#[derive(Serialize, Deserialize)]
pub struct WarehouseSettings {
    pub account_mode: String,
}

pub fn mode(dir: &Path) -> Result<String, String> {
    // An existing accounts file always takes precedence over an open-mode marker.
    if dir.join(USERS).exists() {
        return Ok("accounts".into());
    }
    match fs::read_to_string(dir.join(SETTINGS)) {
        Ok(raw) => {
            let settings: WarehouseSettings = serde_json::from_str(&raw)
                .map_err(|_| "Warehouse settings are damaged. Restore a backup.".to_string())?;
            match settings.account_mode.as_str() {
                "accounts" | "open" => Ok(settings.account_mode),
                _ => Err("Unknown warehouse access mode.".into()),
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok("accounts".into()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn configure(dir: &Path, intent: &str, account_mode: &str) -> Result<(), String> {
    if !dir.is_absolute() {
        return Err("Choose an absolute folder path.".into());
    }
    if !["create", "join"].contains(&intent) {
        return Err("Choose create or join.".into());
    }
    if !["accounts", "open"].contains(&account_mode) {
        return Err("Choose an access mode.".into());
    }
    let existing = [SETTINGS, USERS, STATE, "warehouse_profile.json"]
        .iter()
        .any(|name| dir.join(name).exists());
    if intent == "join" && !existing {
        return Err(
            "No warehouse found here. Choose its data folder or create a new warehouse.".into(),
        );
    }
    if intent == "create" && existing {
        return Err("This folder already contains a warehouse. Choose Join existing warehouse to keep its data and access settings.".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    if intent == "join" {
        mode(dir)?;
    }
    let token = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let probe = dir.join(format!(
        ".warehouse-write-check-{}-{}",
        std::process::id(),
        token
    ));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|e| format!("Folder is not writable: {e}"))?;
    drop(file);
    fs::remove_file(&probe).map_err(|e| e.to_string())?;
    if intent == "create" {
        let settings = WarehouseSettings {
            account_mode: account_mode.into(),
        };
        let data = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join(SETTINGS))
            .map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn access_modes_and_existing_data_are_preserved() {
        let dir = std::env::temp_dir().join(format!("warehouse-setup-test-{}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        assert!(configure(&dir, "join", "open").is_err());
        configure(&dir, "create", "open").unwrap();
        assert_eq!(mode(&dir).unwrap(), "open");
        assert!(configure(&dir, "create", "accounts").is_err());
        configure(&dir, "join", "accounts").unwrap();
        assert_eq!(mode(&dir).unwrap(), "open");
        fs::write(dir.join(USERS), "existing accounts").unwrap();
        assert_eq!(mode(&dir).unwrap(), "accounts");
        assert!(configure(&dir, "create", "open").is_err());
        assert_eq!(
            fs::read_to_string(dir.join(USERS)).unwrap(),
            "existing accounts"
        );
        fs::remove_file(dir.join(USERS)).unwrap();
        fs::write(dir.join(SETTINGS), "broken").unwrap();
        assert!(mode(&dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
