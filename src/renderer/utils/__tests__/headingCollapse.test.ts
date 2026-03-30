import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { HeadingCollapse, collectHeadingSections, getHeadingToggleLabel, headingCollapseKey, toggleHeadingCollapsed } from "../headingCollapse";
import { UniqueId } from "../nodeId";

const createEditor = (content: string) =>
  new Editor({
    extensions: [StarterKit, UniqueId, HeadingCollapse],
    content
  });

describe("headingCollapse", () => {
  it("collects heading sections until the next same-level heading", () => {
    const editor = createEditor(`
      <h2 data-node-id="heading-a">章节 A</h2>
      <p>段落 A1</p>
      <h3 data-node-id="heading-b">章节 B</h3>
      <p>段落 B1</p>
      <h2 data-node-id="heading-c">章节 C</h2>
      <p>段落 C1</p>
    `);

    const sections = collectHeadingSections(editor.state.doc);
    expect(sections.map(({ headingKey, headingId, headingLevel }) => ({ headingKey, headingId, headingLevel }))).toEqual([
      { headingKey: "heading-a", headingId: "heading-a", headingLevel: 2 },
      { headingKey: "heading-b", headingId: "heading-b", headingLevel: 3 },
      { headingKey: "heading-c", headingId: "heading-c", headingLevel: 2 }
    ]);
    expect(sections[0].contentPositions).toHaveLength(3);
    expect(sections[1].contentPositions).toHaveLength(1);
    expect(sections[2].contentPositions).toHaveLength(1);
    expect(sections[0].contentPositions).toContain(sections[1].headingPos);
    expect(Math.max(...sections[0].contentPositions)).toBeLessThan(sections[2].headingPos);
    expect(sections[1].contentPositions[0]).toBeLessThan(sections[2].headingPos);

    editor.destroy();
  });

  it("ignores headings without collapsible content", () => {
    const editor = createEditor(`
      <h2 data-node-id="heading-a">章节 A</h2>
      <h2 data-node-id="heading-b">章节 B</h2>
      <p>段落 B1</p>
    `);

    const sections = collectHeadingSections(editor.state.doc);
    expect(sections.map((section) => section.headingId)).toEqual(["heading-b"]);

    editor.destroy();
  });

  it("toggles collapsed state in the current editor session only", () => {
    const editor = createEditor(`
      <h2 data-node-id="heading-a">章节 A</h2>
      <p>段落 A1</p>
    `);

    const collapsedBefore = headingCollapseKey.getState(editor.state) ?? new Set<string>();
    expect(collapsedBefore.has("heading-a")).toBe(false);

    editor.view.dispatch(toggleHeadingCollapsed(editor.state, "heading-a"));
    const collapsedAfter = headingCollapseKey.getState(editor.state) ?? new Set<string>();
    expect(collapsedAfter.has("heading-a")).toBe(true);

    editor.view.dispatch(toggleHeadingCollapsed(editor.state, "heading-a"));
    const collapsedReset = headingCollapseKey.getState(editor.state) ?? new Set<string>();
    expect(collapsedReset.has("heading-a")).toBe(false);

    editor.destroy();
  });

  it("renders heading collapse attrs into real DOM", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const editor = new Editor({
      element: host,
      extensions: [StarterKit, UniqueId, HeadingCollapse],
      content:
        "<h2 data-node-id=\"heading-a\">12313</h2><p data-node-id=\"para-a\">1</p><h1 data-node-id=\"heading-b\">1</h1><h2 data-node-id=\"heading-c\">2</h2>"
    });

    await Promise.resolve();
    const html = host.innerHTML;
    expect(html).toContain("data-heading-collapsible=\"true\"");
    expect(html).toContain("data-heading-toggle=\"▾\"");
    expect(html).toContain("class=\"heading-collapsible\"");

    editor.destroy();
    host.remove();
  });

  it("distinguishes headings that accidentally share the same node id", () => {
    const editor = createEditor(`
      <h2 data-node-id="dup-heading">标题 A</h2>
      <p>内容 A</p>
      <h2 data-node-id="dup-heading">标题 B</h2>
      <p>内容 B</p>
    `);

    const sections = collectHeadingSections(editor.state.doc);
    expect(sections.map((section) => section.headingKey)).toEqual(["dup-heading", "dup-heading#1"]);

    editor.view.dispatch(toggleHeadingCollapsed(editor.state, "dup-heading"));
    const collapsedAfterFirstToggle = headingCollapseKey.getState(editor.state) ?? new Set<string>();
    expect(collapsedAfterFirstToggle.has("dup-heading")).toBe(true);
    expect(collapsedAfterFirstToggle.has("dup-heading#1")).toBe(false);

    editor.view.dispatch(toggleHeadingCollapsed(editor.state, "dup-heading#1"));
    const collapsedAfterSecondToggle = headingCollapseKey.getState(editor.state) ?? new Set<string>();
    expect(collapsedAfterSecondToggle.has("dup-heading")).toBe(true);
    expect(collapsedAfterSecondToggle.has("dup-heading#1")).toBe(true);

    editor.destroy();
  });

  it("hides section content in real DOM after collapsing", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const editor = new Editor({
      element: host,
      extensions: [StarterKit, UniqueId, HeadingCollapse],
      content: "<h2 data-node-id=\"heading-a\">12313</h2><p>段落 A</p><h1 data-node-id=\"heading-b\">1</h1><h2>2</h2>"
    });

    editor.view.dispatch(toggleHeadingCollapsed(editor.state, "heading-a"));
    const html = host.innerHTML;
    expect(html).toContain("data-heading-collapsed=\"true\"");
    expect(html).toContain("class=\"heading-collapsed-content\"");

    editor.destroy();
    host.remove();
  });

  it("returns the correct toggle label", () => {
    expect(getHeadingToggleLabel(true)).toBe("▸");
    expect(getHeadingToggleLabel(false)).toBe("▾");
  });
});
