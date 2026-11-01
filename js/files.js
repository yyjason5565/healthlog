export async function saveFile(filename, blob) {
  const type = blob.type || "application/octet-stream";
  const file = new File([blob], filename, { type });
  if (navigator.canShare) {
    try {
      if (!navigator.canShare({ files: [file] })) throw new Error("share unavailable");
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
