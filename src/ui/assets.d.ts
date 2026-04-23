// Ambient declarations for asset imports embedded into the binary.
// Bun resolves these to strings at runtime when imported with `type: 'text'`.

declare module '*.svg' {
  const content: string;
  export default content;
}
