import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSettings } from "./features/settings/settingsStore";
import { initLogging } from "./platform/logging";
import "./App.css";

/** Sticky windows open the same bundle with ?sticky=<noteId> */
const stickyNoteId = new URLSearchParams(window.location.search).get("sticky");

async function render() {
  initLogging();
  initSettings();
  let root: React.ReactNode = <App />;
  if (stickyNoteId) {
    document.documentElement.classList.add("sticky-mode");
    const { StickyApp } = await import("./features/sticky/StickyApp");
    root = <StickyApp noteId={stickyNoteId} />;
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{root}</React.StrictMode>,
  );
}

void render();
