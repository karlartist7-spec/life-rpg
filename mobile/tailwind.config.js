/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'doodle-mint': '#83ffc1', 'doodle-pink': '#ff94db', 'doodle-periwinkle': '#8b8bff',
        'doodle-sunshine': '#ffe780', 'doodle-coral': '#ff6b6b', 'doodle-sky': '#a8dcff', 'doodle-lilac': '#e0b8ff',
        paper: '#ffffff', cream: '#fbf7f0', ink: '#000000', 'ink-soft': '#1a1a1a', mute: '#9b9b9b',
        'rarity-rare-bg': '#d6ebff', 'rarity-epic-bg': '#e8c4ff', 'rarity-legendary-bg': '#fff4c4',
      },
      borderRadius: { sm: '8px', md: '16px', lg: '24px', pill: '9999px' },
      fontFamily: { display: ['Fredoka_600SemiBold'], body: ['Nunito_600SemiBold'] },
    },
  },
  plugins: [],
}
