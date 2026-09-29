import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		VitePWA({
			registerType: 'autoUpdate',
			devOptions: { enabled: true, type: 'module' },
			includeAssets: ['favicon.ico', 'achkif-icon.svg', 'apple-touch-icon-180x180.png'],
			manifest: {
				id: '/',
				name: 'Achkif Ceramica',
				short_name: 'Achkif',
				description: 'Inventory and sales management for ceramic tiles and zellij.',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#f4f5ef',
				theme_color: '#173f36',
				icons: [
					{ src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
				navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
			},
		}),
	],
	server: {
		proxy: {
			'/api': 'http://127.0.0.1:8000',
			'/media': 'http://127.0.0.1:8000',
		},
	},
})
