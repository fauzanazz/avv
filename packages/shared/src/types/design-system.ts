export interface DesignTokens {
  colors: Record<string, string>;
  typography: {
    fontFamily: { heading: string; body: string };
    fontSize: Record<string, string>;
    fontWeight: Record<string, string>;
    lineHeight: Record<string, string>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}

export interface DesignSystem {
  id: string;
  label: string;
  tokens: DesignTokens;
  css: string;
}

/** Compile a DesignTokens object into a CSS :root block */
export function compileTokensToCSS(tokens: DesignTokens): string {
  const lines: string[] = [];

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  --color-${name}: ${value};`);
  }

  lines.push(`  --font-heading: ${tokens.typography.fontFamily.heading};`);
  lines.push(`  --font-body: ${tokens.typography.fontFamily.body};`);

  for (const [name, value] of Object.entries(tokens.typography.fontSize)) {
    lines.push(`  --text-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.typography.fontWeight)) {
    lines.push(`  --font-weight-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.typography.lineHeight)) {
    lines.push(`  --leading-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.spacing)) {
    lines.push(`  --spacing-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.borderRadius)) {
    lines.push(`  --radius-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.shadows)) {
    lines.push(`  --shadow-${name}: ${value};`);
  }

  return `:root {\n${lines.join("\n")}\n}`;
}
