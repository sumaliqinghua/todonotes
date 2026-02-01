export function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return `rgba(246, 232, 166, ${opacity})`;
  }
  const expanded = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);
  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return `rgba(246, 232, 166, ${opacity})`;
  }
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  return `rgba(${red}, ${green}, ${blue}, ${safeOpacity})`;
}
