/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      colors: {
        "neo-yellow": "#FBFF48",
        "neo-pink": "#FF70A6",
        "neo-blue": "#3B82F6",
        "neo-green": "#33FF57",
        "neo-purple": "#A855F7",
        "neo-orange": "#FF9F1C",
        "neo-red": "#FF2A2A",
        "neo-white": "#FFFDF5",
        "neo-black": "#121212",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        hard: "4px 4px 0px 0px #000",
        "hard-sm": "2px 2px 0px 0px #000",
        "hard-lg": "8px 8px 0px 0px #000",
        "hard-xl": "12px 12px 0px 0px #000",
      },
    },
  },
  plugins: [],
};
