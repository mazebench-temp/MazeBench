(function () {
  const modules = window.AuthorPlayData || (window.AuthorPlayData = {});
  const actorNames = new Set([
    "player",
    "circle_player",
    "box",
    "gem",
    "floating_floor",
    "weightless_box"
  ]);
  const supportActorNames = new Set([
    "player",
    "circle_player",
    "box",
    "floating_floor",
    "weightless_box"
  ]);
  const raisedTerrainNames = new Set(["wall", "orange_wall"]);

  function titleCaseName(name) {
    return String(name || "")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function createAdapter(authorData) {
    const blockAdder =
      typeof authorData?.blockAdder === "string" && authorData.blockAdder.length > 0
        ? authorData.blockAdder
        : "+";
    const defaultFloorToken = authorData?.defaultFloorToken || ".";
    const palette = Array.isArray(authorData?.palette) ? authorData.palette : [];
    const toolByToken = new Map(palette.map((tool) => [tool.token, tool]));
    const toolByName = new Map(palette.map((tool) => [tool.name, tool]));

    function toolType(tool) {
      return tool?.type || tool?.name;
    }

    function normalizeCellValue(value) {
      const trimmedValue = String(value ?? "").trim();

      if (!trimmedValue) {
        return defaultFloorToken;
      }

      const tokens = trimmedValue
        .split(blockAdder)
        .map((token) => token.trim())
        .filter(Boolean);

      if (tokens.length === 0) {
        return defaultFloorToken;
      }

      const invalidToken = tokens.find((token) => !toolByToken.has(token));

      if (invalidToken) {
        throw new Error('Unknown token "' + invalidToken + '".');
      }

      return tokens.join(blockAdder);
    }

    function getCellTokens(value) {
      return String(value || "")
        .split(blockAdder)
        .map((token) => token.trim())
        .filter(Boolean);
    }

    function getCellTools(value) {
      return getCellTokens(value)
        .map((token) => toolByToken.get(token))
        .filter(Boolean);
    }

    function getCellDescriptor(value) {
      const tokens = getCellTokens(value);
      const topToken = tokens[tokens.length - 1] || defaultFloorToken;
      const tool = toolByToken.get(topToken) || toolByToken.get(tokens[0]) || null;

      return {
        label: tool ? tool.label : topToken,
        tool,
        topToken,
        tokens
      };
    }

    function isActorTool(tool) {
      return actorNames.has(toolType(tool));
    }

    function isSupportActorTool(tool) {
      return supportActorNames.has(toolType(tool));
    }

    function isRaisedTerrainTool(tool) {
      const type = toolType(tool);

      return (
        raisedTerrainNames.has(type) ||
        (type === "player_lift" && tool?.initialRaised === true)
      );
    }

    function buildTerrainCell(type, tool = null, options = {}) {
      return {
        type,
        label: tool?.label || titleCaseName(type),
        imageUrl: tool?.imageUrl || null,
        layers: Array.isArray(options.layers) ? options.layers : null,
        underlay: options.underlay || null,
        raised: options.raised === true
      };
    }

    function buildTerrainLayer(tool, elevation) {
      const type = toolType(tool);

      return {
        type,
        label: tool?.label || titleCaseName(type),
        imageUrl: tool?.imageUrl || null,
        elevation,
        raised: type === "player_lift" ? tool?.initialRaised === true : false
      };
    }

    function buildCellStack(tools) {
      const floorTool = toolByName.get("floor") || null;
      const exitTool = toolByName.get("exit") || null;
      const terrainLayers = [];
      const actors = [];
      let surfaceHeight = null;
      let previousSurfaceTerrain = false;

      tools.forEach((tool) => {
        if (isActorTool(tool)) {
          const elevation = Math.max(0, surfaceHeight ?? 0);

          actors.push({
            elevation,
            tool
          });

          if (isSupportActorTool(tool)) {
            surfaceHeight = elevation + 1;
            previousSurfaceTerrain = false;
          }

          return;
        }

        const terrainType = toolType(tool);
        const isRaisedTerrain = isRaisedTerrainTool(tool);
        let elevation = Math.max(0, surfaceHeight ?? 0);

        if (!isRaisedTerrain && previousSurfaceTerrain && surfaceHeight !== null) {
          elevation = surfaceHeight + 1;
        }

        terrainLayers.push(buildTerrainLayer(tool, elevation));
        surfaceHeight = elevation + (isRaisedTerrain ? 1 : 0);
        previousSurfaceTerrain = !isRaisedTerrain;
      });

      const wallLayer = terrainLayers.find((layer) => layer.type === "wall") || null;
      const exitLayer = terrainLayers.find((layer) => layer.type === "exit") || null;
      const topLayer =
        terrainLayers.length > 0
          ? terrainLayers.reduce((highest, layer) =>
              layer.elevation >= highest.elevation ? layer : highest
            )
          : null;
      const terrainLayer = wallLayer || exitLayer || topLayer || null;
      const terrainLayerTool = terrainLayer || null;
      const layers = terrainLayers.map((layer) => ({ ...layer }));

      if (wallLayer) {
        const underlayLayer = terrainLayers.find((layer) => layer.type !== "wall") || null;
        const underlayTool = underlayLayer || floorTool;

        return {
          actors,
          terrain: buildTerrainCell("wall", terrainLayerTool || wallLayer, {
            layers,
            underlay: buildTerrainCell(
              underlayLayer?.type || toolType(underlayTool) || "floor",
              underlayTool
            )
          })
        };
      }

      if (terrainLayer?.type === "exit") {
        return {
          actors,
          terrain: buildTerrainCell("exit", exitTool || terrainLayerTool || terrainLayer, {
            layers
          })
        };
      }

      if (terrainLayer) {
        const terrainType = terrainLayer.type;
        const tool = terrainLayerTool || terrainLayer;

        return {
          actors,
          terrain: buildTerrainCell(terrainType, tool, {
            layers,
            raised: terrainType === "player_lift" ? terrainLayer.raised === true : undefined
          })
        };
      }

      if (actors.length > 0) {
        return {
          actors,
          terrain: buildTerrainCell("floor", floorTool, {
            layers: [buildTerrainLayer(floorTool || { name: "floor", type: "floor" }, 0)]
          })
        };
      }

      return {
        actors,
        terrain: buildTerrainCell("empty", null, { layers: [] })
      };
    }

    function buildCellState(tools) {
      return buildCellStack(tools).terrain;
    }

    function buildPlayData(options = {}) {
      const includeGems = options.includeGems !== false;
      const width = Math.max(1, Number(options.width) || 1);
      const height = Math.max(1, Number(options.height) || 1);
      const cells = Array.isArray(options.cells) ? options.cells : [];
      const terrain = [];
      const actors = [];

      for (let y = 0; y < height; y += 1) {
        const terrainRow = [];

        for (let x = 0; x < width; x += 1) {
          const tools = getCellTools(cells[y]?.[x] || defaultFloorToken);
          const cellStack = buildCellStack(tools);

          terrainRow.push(cellStack.terrain);
          cellStack.actors.forEach(({ tool, elevation }) => {
            if (!includeGems && tool.name === "gem") {
              return;
            }

            actors.push({
              type: toolType(tool),
              groupId: toolType(tool) === "weightless_box" ? tool.token : null,
              label: tool.label,
              imageUrl: tool.imageUrl || null,
              elevation,
              x,
              y
            });
          });
        }

        terrain.push(terrainRow);
      }

      return {
        gameId: options.gameId || authorData?.game?.id || "maze",
        levelId: options.levelId || "__editor__",
        levelLabel: options.levelLabel || options.levelId || "__editor__",
        sourceFileName: options.sourceFileName || "",
        width,
        height,
        terrain,
        actors,
        cameraView: options.cameraView || null,
        worldColumns: options.worldColumns || null,
        worldRows: options.worldRows || null
      };
    }

    return {
      actorNames,
      buildCellState,
      buildPlayData,
      getCellDescriptor,
      getCellTokens,
      getCellTools,
      isActorTool,
      normalizeCellValue,
      toolByName,
      toolByToken
    };
  }

  modules.createAdapter = createAdapter;
})();
