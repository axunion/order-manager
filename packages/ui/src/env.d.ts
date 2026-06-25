// CSS Modules type declaration for .module.css files.
// Vite processes these at build time; this declaration satisfies TypeScript.
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}
