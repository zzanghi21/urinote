import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";
import { isDesktopApp } from "./env";

/** Saves a JSON file through a save dialog. false if cancelled */
export async function saveJsonFile(fileName: string, contents: string): Promise<boolean> {
  if (isDesktopApp) {
    return invoke<boolean>("backup_save", {
      fileName,
      filterName: t("Urinote 백업 (JSON)"),
      contents,
    });
  }
  // browser preview: download
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Reads a JSON file through an open dialog. null if cancelled */
export async function openJsonFile(): Promise<string | null> {
  if (isDesktopApp)
    return invoke<string | null>("backup_open", { filterName: t("Urinote 백업 (JSON)") });
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      accept: ".json,application/json",
    });
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void file.text().then(resolve);
      else resolve(null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
