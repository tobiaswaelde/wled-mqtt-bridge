import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'WLED MQTT Bridge',
  description: 'Rust bridge between WLED and MQTT',
  base: '/wled-mqtt-bridge/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Configuration', link: '/configuration' },
      { text: 'Operations', link: '/operations' }
    ],
    sidebar: [
      {
        text: 'User Guide',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Configuration', link: '/configuration' },
          { text: 'Topic Contract', link: '/topic-contract' },
          { text: 'Operations', link: '/operations' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Deployment', link: '/deployment' }
        ]
      },
      {
        text: 'Developer',
        items: [
          { text: 'Developer', link: '/developer' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Concepts', link: '/concepts' },
          { text: 'Recipes', link: '/recipes' }
        ]
      }
    ]
  }
});
