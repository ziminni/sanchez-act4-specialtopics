export const defaultTheme = "#2563eb";
export function themeStyle(color: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : defaultTheme;
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) =>
      v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    );
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return {
    "--theme": hex,
    "--theme-on": luminance > 0.179 ? "#102033" : "#ffffff",
  } as React.CSSProperties;
}
