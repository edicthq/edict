fn main() {
    // Listing the app's commands makes each one need a permission
    // (allow-connect), so only the bundled connect page can call it, never a
    // server's page.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["connect"])),
    )
    .expect("failed to run the Tauri build script");
}
