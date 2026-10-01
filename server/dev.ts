import { createServer, loadEnv } from "vite";
Object.assign(process.env, loadEnv("development", process.cwd(), "OOPAD_"));
const { default: app } = await import("./app.js");
const vite = await createServer({
  server: { middlewareMode: true, hmr: { port: 5573 } },
  appType: "spa",
});
app.use(vite.middlewares);
app.listen(5572, "0.0.0.0", () =>
  console.log("Oopad http://localhost:5572"),
);
