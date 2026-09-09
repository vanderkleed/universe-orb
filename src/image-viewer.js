import { originalUrl, thumbUrl, prettyName } from "./data.js";

export function createImageViewer(onChange) {
  const dialog = document.getElementById("image-viewer");
  const stage = document.getElementById("viewer-stage");
  const status = document.getElementById("viewer-status");
  const count = document.getElementById("viewer-count");
  const prev = document.getElementById("viewer-prev");
  const next = document.getElementById("viewer-next");
  let keys = [], index = 0, star = null, revision = 0, returnTo = null;
  function show(step = 0) {
    index = (index + step + keys.length) % keys.length;
    const version = ++revision;
    stage.replaceChildren();
    status.hidden = false;
    status.textContent = "Loading full-resolution image…";
    count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(keys.length).padStart(2, "0")}`;
    prev.disabled = next.disabled = keys.length < 2;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.alt = `${prettyName(star.slug)} — sample ${index + 1}`;
    image.decoding = "async";
    let fallback = false;
    image.onload = () => {
      if (version !== revision || !dialog.open) return;
      stage.replaceChildren(image);
      status.hidden = !fallback;
      status.textContent = fallback ? "Preview resolution · original unavailable" : "";
    };
    image.onerror = () => {
      if (version !== revision || !dialog.open) return;
      if (!fallback) { fallback = true; image.src = thumbUrl(keys[index]); }
      else { status.hidden = false; status.textContent = "This image is unavailable. Try another sample."; }
    };
    image.src = originalUrl(keys[index]);
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener("close", () => {
    revision++;
    stage.replaceChildren();
    onChange(false);
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", e => { if (e.target === dialog) close(); });
  dialog.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); show(e.key === "ArrowLeft" ? -1 : 1); }
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") {
      const buttons = [...dialog.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.getElementById("viewer-close").addEventListener("click", close);
  prev.addEventListener("click", () => show(-1));
  next.addEventListener("click", () => show(1));
  return {
    get open() { return dialog.open; }, close,
    show(dataset, samples, selected, trigger) {
      if (!samples.length) return;
      star = dataset; keys = samples; index = selected; returnTo = trigger;
      document.getElementById("viewer-title").textContent = prettyName(star.slug);
      document.getElementById("viewer-context").textContent = `${star.galaxy} / public dataset`;
      dialog.showModal();
      onChange(true);
      show();
      document.getElementById("viewer-close").focus();
    },
  };
}
