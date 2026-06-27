export const minimalProject = {
  palette: ["#111827", "#f8fafc"],
  godot: {
    asset: "e2e_fixture",
    animation: "idle_w",
    direction: "W",
    fps: 6,
    loop: true,
  },
  background: {
    mode: "transparent",
    color: "#0f172a",
  },
  frames: [
    {
      id: "frame-e2e-1",
      name: "Frame 1",
      duration: 100,
      layers: [
        {
          id: "layer-e2e-base",
          name: "Base",
          visible: true,
          opacity: 1,
          pixels: [],
        },
      ],
      activeLayerId: "layer-e2e-base",
    },
  ],
  activeFrameId: "frame-e2e-1",
};
