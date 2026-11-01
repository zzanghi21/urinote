import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSettings } from "./features/settings/settingsStore";
import { initLogging } from "./platform/logging";
import "./App.css";

/** 스티키 창은 같은 번들을 ?sticky=<noteId> 로 연다 */
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
