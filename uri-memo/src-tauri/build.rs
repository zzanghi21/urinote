use tauri_build::{Attributes, DefaultPermissionRule, InlinedPlugin};

fn main() {
    // app-local Android plugin (lib.rs `reminder_tap_plugin`): its commands need ACL entries
    // like any plugin's, or the webview's calls are rejected. Names as the webview sends them (the
    // Kotlin method names): the check compares them literally
    tauri_build::try_build(
        Attributes::new().plugin(
            "reminder-tap",
            InlinedPlugin::new()
                .commands(&["takePending", "registerListener", "removeListener"])
                .default_permission(DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to run tauri-build")
}
