export function stripBulletLines(description: string): string {
  return description
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return (
        !t.startsWith("・") &&
        !t.startsWith("- ") &&
        !/^- \[[ xX]\]/.test(t)
      );
    })
    .join("\n")
    .trim();
}
