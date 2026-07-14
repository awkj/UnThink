#[cfg(any(target_os = "windows", target_os = "ios"))]
compile_error!("This fork currently supports Tauri on macOS and Android only.");

#[cfg(any(target_os = "macos", test))]
fn native_navigation_route(id: &str) -> Option<&'static str> {
    match id {
        "today" => Some("/today"),
        "inbox" => Some("/inbox"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn setup_macos(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::{Emitter, Manager, menu::MenuBuilder, tray::TrayIconBuilder};

    let menu = MenuBuilder::new(app)
        .text("today", "Today")
        .text("inbox", "Inbox")
        .separator()
        .text("quit", "Quit Unthink")
        .build()?;
    let icon = app.default_window_icon().cloned();
    let mut tray = TrayIconBuilder::with_id("unthink")
        .menu(&menu)
        .tooltip("Unthink")
        .icon_as_template(true)
        .on_menu_event(|app, event| match native_navigation_route(event.id().as_ref()) {
            Some(route) => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("native-navigate", route);
            }
            None if event.id().as_ref() == "quit" => app.exit(0),
            None => {}
        });
    if let Some(icon) = icon {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::native_navigation_route;

    #[test]
    fn native_menu_only_emits_supported_routes() {
        assert_eq!(native_navigation_route("today"), Some("/today"));
        assert_eq!(native_navigation_route("inbox"), Some("/inbox"));
        assert_eq!(native_navigation_route("quit"), None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            setup_macos(_app)?;
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running UnThink");
}
