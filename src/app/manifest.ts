import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Card Collection",
    short_name: "Card Collection",
    description: "Quản lý bộ sưu tập, kho card và hoạt động bán hàng.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b1d",
    theme_color: "#7c3aed",
    orientation: "portrait",
    icons: [
      {
        src: "/images/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
