import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { launch, resetData, startDriver, stopDriver, setLanguage, type App } from "./driver";

/** Wait longer than the editor's save debounce (500 ms) and the document batch (200 ms) */
const SAVE_WAIT_MS = 1500;

let app: App | null = null;

beforeAll(async () => {
  resetData();
  await startDriver();
});

afterEach(async () => {
  await app?.deleteSession();
  app = null;
});

afterAll(() => {
  stopDriver();
  resetData();
});

async function open() {
  app = await launch();
  await setLanguage(app, "ko");
  return app;
}

async function titles(a: App) {
  return a.$$(".note-card-title").map((c) => c.getText());
}

async function newNote(a: App, text: string) {
  await a.$(".new-btn").click();
  const editor = a.$(".note-editor-content");
  await editor.waitForExist();
  await editor.click();
  // element send-keys works on contenteditable with both msedgedriver and WebKitWebDriver
  await editor.addValue(text);
  await a.pause(SAVE_WAIT_MS);
}

describe("Urinote desktop app", () => {
  it("keeps a new note after restarting the app", async () => {
    let a = await open();
    await newNote(a, "Groceries");
    expect(await titles(a)).toContain("Groceries");

    await a.deleteSession();
    a = app = await launch();
    await a.$(".note-card").waitForExist({ timeout: 10_000 });
    expect(await titles(a)).toContain("Groceries");
  });

  it("searches, trashes and restores notes", async () => {
    const a = await open();
    await newNote(a, "Meeting notes");

    await a.$("input.search").setValue("Groc");
    await a.waitUntil(async () => (await titles(a)).join() === "Groceries");

    // clear like a user does (WebDriver clear doesn't fire React's input event)
    await a.$("input.search").click();
    await a.keys(["Control", "a"]);
    await a.keys("Backspace");
    await a.waitUntil(async () => (await titles(a)).length === 2);
    // the newest note is selected → move it to the trash
    await a.$('button[aria-label="휴지통으로 이동"]').click();
    await a.waitUntil(async () => (await titles(a)).join() === "Groceries");

    const tabs = await a.$$(".view-tab");
    await tabs[2].click(); // trash
    await a.waitUntil(async () => (await titles(a)).join() === "Meeting notes");
    await a.$(".note-card").click();
    await a.$("button=복원").click();
    await tabs[0].click(); // all
    await a.waitUntil(async () => (await titles(a)).length === 2);
  });

  it("creates a folder and files new notes into it", async () => {
    const a = await open();
    await a.$(".folder-chip.add").click();
    await a.$('input[name="name"]').setValue("Work");
    await a.keys("Enter");
    await a
      .$(
        "//button[contains(@class, 'folder-chip') and contains(@class, 'active') and text()='Work']",
      )
      .waitForExist();

    await newNote(a, "Quarterly goals");
    expect(await titles(a)).toEqual(["Quarterly goals"]);

    await a.$("//button[contains(@class, 'folder-chip') and text()='모든 폴더']").click();
    await a.waitUntil(async () => (await titles(a)).length === 3);
  });

  it("switches the UI to English from settings", async () => {
    const a = await open();
    await a.$('button[aria-label="설정"]').click();
    await a.$('input[name="language"][value="en"]').parentElement().click();
    await a.$('button[aria-label="Settings"]').waitForExist();
    expect(await a.$("input.search").getAttribute("placeholder")).toMatch(/^Search notes/);
  });

  it("opens a note as a sticky window and syncs edits back to the list", async () => {
    const a = await open();
    await a.$("//span[contains(@class, 'note-card-title') and text()='Groceries']").click();
    const hub = await a.getWindowHandle();
    await a.$('button[aria-label="바탕화면에 붙이기"]').click();
    await a.waitUntil(async () => (await a.getWindowHandles()).length === 2, { timeout: 15_000 });

    const sticky = (await a.getWindowHandles()).find((h) => h !== hub)!;
    await a.switchToWindow(sticky);
    const editor = a.$(".note-editor-content");
    await editor.waitForExist({ timeout: 15_000 });
    await editor.click();
    await a.keys(["Control", "Home"]);
    await a.keys("Weekly ");
    await a.pause(SAVE_WAIT_MS);

    await a.switchToWindow(hub);
    await a.waitUntil(async () => (await titles(a)).includes("Weekly Groceries"), {
      timeout: 10_000,
    });
  });
});
