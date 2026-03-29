import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'WLED MQTT Bridge',
  description: 'Rust bridge between WLED and MQTT',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Configuration', link: '/configuration' },
      { text: 'Deployment', link: '/deployment' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Configuration', link: '/configuration' },
          { text: 'Topic Contract', link: '/topic-contract' },
          { text: 'Operations', link: '/operations' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Deployment', link: '/deployment' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Recipes', link: '/recipes' },
          { text: 'Concepts', link: '/concepts' }
        ]
      }
    ]
  }
});
