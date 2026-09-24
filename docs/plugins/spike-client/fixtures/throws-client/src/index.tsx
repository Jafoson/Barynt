// Throws while rendering: the host's error boundary must contain it.
export default function ThrowsClient(): never {
  throw new Error("plugin exploded while rendering");
}
