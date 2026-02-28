chrome.storage.local.get("doodlePreviewImg", ({ doodlePreviewImg }) => {
  if (doodlePreviewImg) {
    (document.getElementById("img") as HTMLImageElement).src = doodlePreviewImg as string;
  }
});

window.addEventListener("keydown", (e) => { if (e.key === "Escape") window.close(); });
document.getElementById("close")?.addEventListener("click", () => window.close());
