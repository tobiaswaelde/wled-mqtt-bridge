import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const config = defineConfig({
  title: "WLED MQTT Bridge",
  description: "Documentation for setup, configuration, operations, and integrations",
  base: "/wled-mqtt-bridge/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/" },
      { text: "Configuration", link: "/configuration" },
      { text: "Deployment", link: "/deployment" },
      { text: "Troubleshooting", link: "/troubleshooting" }
    ],
    search: {
      provider: "local"
    },
    sidebar: [
      { text: "Overview", link: "/" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "Concepts", link: "/concepts" },
      { text: "Architecture", link: "/architecture" },
      { text: "Recipes", link: "/recipes" },
      { text: "Topic Contract", link: "/topic-contract" },
      { text: "Configuration", link: "/configuration" },
      { text: "Deployment", link: "/deployment" },
      { text: "Troubleshooting", link: "/troubleshooting" },
      { text: "Operations", link: "/operations" },
      { text: "Developer", link: "/developer" }
    ],
    editLink: {
      pattern: "https://github.com/tobiaswaelde/wled-mqtt-bridge/edit/main/docs/:path",
      text: "Edit this page on GitHub"
    },
    lastUpdatedText: "Last updated",
    socialLinks: [
      { icon: "github", link: "https://github.com/tobiaswaelde/wled-mqtt-bridge" }
    ],
    footer: {
      message: "Released under MIT License",
      copyright: "Copyright 2026 WLED MQTT Bridge"
    }
  }
});

export default withMermaid(config);
