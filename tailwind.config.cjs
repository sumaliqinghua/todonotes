module.exports = {
  content: ["./src/renderer/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#0f1216",
          panel: "#171b21",
          panelAlt: "#212733",
          border: "#2c3440",
          accent: "#6fb6ff",
          accentStrong: "#4b8fe6",
          accentSoft: "#cfe6ff",
          highlight: "#7ed9c7",
          text: "#e6eaf0",
          muted: "#9aa3b2",
          sticky: "#f6e8a6"
        }
      },
      fontFamily: {
        sans: ["\"Archivo\"", "\"PingFang SC\"", "\"Microsoft YaHei\"", "sans-serif"],
        display: ["\"Fraunces\"", "\"Songti SC\"", "serif"]
      },
      boxShadow: {
        soft: "0 18px 40px rgba(0, 0, 0, 0.45)",
        glow: "0 0 0 1px rgba(111, 182, 255, 0.28), 0 12px 30px rgba(0, 0, 0, 0.45)"
      }
    }
  },
  plugins: []
};
