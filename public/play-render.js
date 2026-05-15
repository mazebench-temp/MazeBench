(function () {
  const modules = window.PlayModules || (window.PlayModules = {});

  modules.registerRenderFunctions = function registerRenderFunctions(app) {
    if (typeof modules.registerRenderEffectsFunctions !== "function") {
      throw new Error("play-render-effects.js must be loaded before play-render.js");
    }

    modules.registerRenderEffectsFunctions(app);

    if (typeof modules.registerRenderTerrainFunctions !== "function") {
      throw new Error("play-render-terrain.js must be loaded before play-render.js");
    }

    modules.registerRenderTerrainFunctions(app);

    if (typeof modules.registerRenderActorFunctions !== "function") {
      throw new Error("play-render-actors.js must be loaded before play-render.js");
    }

    modules.registerRenderActorFunctions(app);

    if (typeof modules.registerThreeRenderFunctions === "function") {
      modules.registerThreeRenderFunctions(app);
    }

    if (typeof modules.registerRenderCompositorFunctions !== "function") {
      throw new Error("play-render-compositor.js must be loaded before play-render.js");
    }

    modules.registerRenderCompositorFunctions(app);

    const { syncCameraTarget, advanceCamera } = app;
    const { renderCompositor } = app;
    let lastActiveRenderNow = 0;

    function syncLiveSurfaceState(now) {
      app.liveRaisedPlayerGates = app.gateRenderOverride || app.computeRaisedPlayerGateSet();
      app.liveRaisedOrangeWalls = app.orangeWallRenderOverride || app.computeRaisedOrangeWallSet();
      app.syncGateAnimationTargets(now);
      app.syncOrangeWallAnimationTargets(now);
      app.syncPlayerLiftAnimationTargets(now);
    }

    function normalizeRenderNow(now) {
      const nextNow = Number.isFinite(now) ? now : performance.now();
      const hasActiveMotion = Boolean(
        app.isAnimating ||
          app.isTransitioningLevel ||
          app.levelTransition ||
          app.cameraFrameId !== null ||
          app.gateAnimationFrameId !== null ||
          app.orangeWallAnimationFrameId !== null ||
          app.playerLiftAnimationFrameId !== null
      );

      if (!hasActiveMotion) {
        lastActiveRenderNow = 0;
        return nextNow;
      }

      lastActiveRenderNow = Math.max(lastActiveRenderNow, nextNow);
      return lastActiveRenderNow;
    }

    function render(now = performance.now()) {
      now = normalizeRenderNow(now);
      syncCameraTarget();
      const isCameraActive = advanceCamera(now);
      syncLiveSurfaceState(now);
      const activeLevelTransition = renderCompositor.composeLevelTransitionSource(now);

      if (activeLevelTransition) {
        const settings = app.getEffectSettings();

        if (!app.renderWithShader(activeLevelTransition.sourceCanvas, settings)) {
          app.renderFallback(activeLevelTransition.sourceCanvas);
        }

        if (activeLevelTransition.active) {
          renderCompositor.startLevelTransitionLoop();
          return;
        }

        const onComplete = app.levelTransition?.onComplete;
        app.levelTransition = null;
        app.isTransitioningLevel = false;

        if (onComplete && onComplete() === false) {
          return;
        }

        app.skipNextStaticRenderAfterTransition = true;

        if (app.queuedAction) {
          const nextAction = app.queuedAction;
          app.queuedAction = null;
          window.setTimeout(() => {
            app.runAction?.(nextAction);
          }, 0);
        }

        return;
      }

      if (
        app.skipNextStaticRenderAfterTransition &&
        !app.isAnimating &&
        !isCameraActive &&
        app.cameraFrameId === null &&
        app.gateAnimationFrameId === null &&
        app.orangeWallAnimationFrameId === null &&
        app.playerLiftAnimationFrameId === null
      ) {
        app.skipNextStaticRenderAfterTransition = false;
        return;
      }

      renderCompositor.drawScene(now);
      const settings = app.getEffectSettings();
      const sourceCanvas = renderCompositor.composeViewportSource();

      if (!app.renderWithShader(sourceCanvas, settings)) {
        app.renderFallback(sourceCanvas);
      }

      if (isCameraActive && !app.isAnimating) {
        app.startCameraFollowLoop();
      }
    }

    Object.assign(app, {
      render
    });
  };
})();
