import { beforeEach, describe, expect, it } from "vitest";
import { resetAppStore, useAppStore } from "../useAppStore";

beforeEach(() => {
  resetAppStore();
});

describe("useAppStore", () => {
  it("updates navigation and window settings", () => {
    const store = useAppStore.getState();
    store.setNavPath(["root", "child"]);
    store.updateWindowSettings({ stickyColor: "#ffffff", stickyOpacity: 0.8 });

    const next = useAppStore.getState();
    expect(next.navPath).toEqual(["root", "child"]);
    expect(next.windowSettings.stickyColor).toBe("#ffffff");
    expect(next.windowSettings.stickyOpacity).toBe(0.8);
    expect(next.windowSettings.opacity).toBe(1);
  });

  it("switches library tab", () => {
    const store = useAppStore.getState();
    store.setLibraryTab("archived");
    expect(useAppStore.getState().libraryTab).toBe("archived");
  });
});
