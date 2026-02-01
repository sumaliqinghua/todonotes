module.exports = {
  content: ["./src/renderer/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#151517",
          panel: "#1f1f23",
          panelAlt: "#26262c",
          border: "#2f2f36",
          accent: "#4b84ff",
          accentStrong: "#2d5bd7",
          text: "#e6e6ea",
          muted: "#a1a1aa",
          sticky: "#f6e8a6"
        }
      },
      fontFamily: {
        sans: ["\"Segoe UI\"", "\"PingFang SC\"", "\"Microsoft YaHei\"", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 40px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};
