export default {
  devIndicators: false,
  distDir: process.env.NODE_ENV === "development" && process.env.FOCURA_LOCAL_DEMO === "1" ? ".next-demo" : ".next",
};
