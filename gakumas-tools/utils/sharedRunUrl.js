// A shared run's link. It has no locale prefix, so whoever opens it gets
// the page in their own language.
export function sharedRunUrl(id, origin = window.location.origin) {
  return new URL(`/s/${id}`, origin).toString();
}

// Copies text that's still being fetched. Call it within the tap: Safari
// only lets a page write the clipboard during the gesture, so the write
// starts now and is handed the text when it arrives.
export function copyWhenReady(textPromise) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = textPromise.then(
      (text) => new Blob([text], { type: "text/plain" }),
    );
    return navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
  }
  return textPromise.then((text) => navigator.clipboard.writeText(text));
}
