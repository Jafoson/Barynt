/**
 * A drag image that stays crisp (BARY-165).
 *
 * The browser's own drag image is a translucent snapshot — and Chrome fades
 * a large one (a whole board column) out towards its edges. This swaps it
 * for an invisible one and lets a solid copy of `source` follow the pointer
 * instead, tilted and lifted like a dragged card.
 *
 * Call it in `dragstart`; call what it returns in `dragend`.
 */

// A 1×1 transparent GIF, created once so it's decoded before the first
// drag — `setDragImage` with an image that isn't loaded yet falls back to
// the default snapshot.
const EMPTY =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });

export function startDragPreview(
  event: React.DragEvent,
  source: HTMLElement,
  { background }: { background?: string } = {},
): () => void {
  const rect = source.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  const place = (x: number, y: number) => {
    ghost.style.transform = `translate(${x}px, ${y}px) rotate(1.5deg)`;
  };
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    opacity: "1",
    pointerEvents: "none",
    zIndex: "2000",
    boxShadow: "0 12px 32px rgb(0 0 0 / 0.35)",
    ...(background ? { background } : {}),
  });
  place(rect.left, rect.top);
  document.body.appendChild(ghost);

  if (EMPTY) event.dataTransfer.setDragImage(EMPTY, 0, 0);

  // `dragover` on the document carries the pointer everywhere (the source's
  // own `drag` event reports 0/0 in some browsers).
  const follow = (e: DragEvent) => {
    if (e.clientX === 0 && e.clientY === 0) return;
    place(e.clientX - offsetX, e.clientY - offsetY);
  };
  document.addEventListener("dragover", follow);

  return () => {
    document.removeEventListener("dragover", follow);
    ghost.remove();
  };
}
