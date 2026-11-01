import type { MetadataRoute } from "next";

// Added to a phone's home screen, the game opens fullscreen and sideways: the only way to lose
// the browser bars on an iPhone, whose browser has no fullscreen API.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Блок-Арена",
    short_name: "Блок-Арена",
    description: "Кубический PvP до последнего выжившего",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#8fc8ff",
    theme_color: "#8fc8ff",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
