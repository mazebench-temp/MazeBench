(function () {
  const modules = window.PlayModules || {};

  function previewCanvasToDataUrl(canvas) {
    if (!canvas || typeof canvas.toDataURL !== "function") {
      throw new Error("Preview canvas is not available.");
    }

    return canvas.toDataURL("image/png");
  }

  async function renderPreviewDataUrl(playData) {
    if (
      typeof modules.createPlayCore !== "function" ||
      typeof modules.registerRenderFunctions !== "function"
    ) {
      throw new Error("Preview renderer modules are unavailable.");
    }

    const canvas = document.createElement("canvas");
    const app = modules.createPlayCore({
      playData,
      canvas,
      playShell: null,
      playHeader: null,
      playStage: null,
      mazeFrame: null,
      fuzzyToggle: null
    });

    if (!app) {
      throw new Error("Could not initialize the preview renderer.");
    }

    modules.registerRenderFunctions(app);
    app.setupCanvas();
    app.syncCameraTarget(true);

    const neighborRequests = Array.from(app.horizontalNeighborLevelStates.values()).filter(
      (candidate) => candidate && typeof candidate.then === "function"
    );

    if (neighborRequests.length > 0) {
      await Promise.allSettled(neighborRequests);
    }

    await app.preloadImages();
    app.render();

    if (app.gl && typeof app.gl.finish === "function") {
      app.gl.finish();
    }

    const dataUrl = previewCanvasToDataUrl(canvas);

    if (app.gl && typeof app.gl.getExtension === "function") {
      const loseContextExtension = app.gl.getExtension("WEBGL_lose_context");

      if (loseContextExtension && typeof loseContextExtension.loseContext === "function") {
        loseContextExtension.loseContext();
      }
    }

    canvas.width = 0;
    canvas.height = 0;

    return dataUrl;
  }

  async function savePreview(options) {
    const levelId = String(options?.levelId || "");
    const previewApiBaseUrl = String(options?.previewApiBaseUrl || "");

    if (!levelId || !previewApiBaseUrl) {
      throw new Error("Missing preview target.");
    }

    const imageDataUrl = await renderPreviewDataUrl(options.playData);
    const response = await fetch(
      previewApiBaseUrl + "/" + encodeURIComponent(levelId) + "/preview",
      {
        body: JSON.stringify({ imageDataUrl }),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        method: "POST"
      }
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not save the preview.");
    }

    return payload;
  }

  window.LevelPreviewRenderer = {
    renderPreviewDataUrl,
    savePreview
  };
})();
